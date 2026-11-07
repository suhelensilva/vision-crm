import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/crypto"
import { withCountryCode } from "@/lib/phone"

/**
 * Envio de conversões para o Meta (Conversions API).
 *
 * Usamos action_source = "chat": conversão feita por app de mensagem. É o
 * formato certo para quem usa o WhatsApp Web / app (o formato
 * "business_messaging" exige a API oficial do WhatsApp).
 * O Meta liga o evento à pessoa pelo telefone (enviado só como hash SHA-256).
 *
 * Regras da API (docs oficiais do Meta):
 *  - event_time com no máximo 7 dias; um evento velho derruba a requisição toda.
 *  - ph/fn/ln/external_id/country vão em SHA-256; ctwa_clid vai sem hash.
 *  - test_event_code NÃO isola os dados da medição real.
 */

const GRAPH_BASE = (process.env.META_GRAPH_BASE ?? "https://graph.facebook.com").replace(/\/$/, "")
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v27.0"
const MAX_AGE_SECONDS = 7 * 24 * 3600 - 3600 // 7 dias menos 1h de folga
const EXPIRED_MSG = "Expirado: o Meta só aceita eventos de até 7 dias"

export const META_GRAPH_VERSION = GRAPH_VERSION

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")

/** Telefone no formato do Meta: só dígitos, com DDI (assume Brasil se vier sem). */
export function phoneForMeta(raw: string): string | null {
  return withCountryCode(raw) || null
}

/** Nome e sobrenome em minúsculas, sem pontuação. Ignora nome genérico e a palavra "cliente". */
export function nameForMeta(name: string): { fn?: string; ln?: string } {
  if (!name || name === "Cliente WhatsApp") return {}
  const parts = name
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p && p !== "cliente" && p !== "clientes")
  if (parts.length === 0) return {}
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : undefined }
}

type EventInput = {
  purchase: { id: string; amount: number; productName: string | null; purchasedAt: Date; ctwaClid: string | null }
  contact: { id: string; name: string; phone: string }
  purchaseNumber: number
}

export function buildEvent({ purchase, contact, purchaseNumber }: EventInput) {
  const ph = phoneForMeta(contact.phone)
  const { fn, ln } = nameForMeta(contact.name)

  const user_data: Record<string, unknown> = {
    external_id: [sha256(contact.id)],
    country: [sha256("br")],
  }
  if (ph) user_data.ph = [sha256(ph)]
  if (fn) user_data.fn = [sha256(fn)]
  if (ln) user_data.ln = [sha256(ln)]
  if (purchase.ctwaClid) user_data.ctwa_clid = purchase.ctwaClid // sem hash

  const custom_data: Record<string, unknown> = {
    currency: "BRL",
    value: purchase.amount,
    purchase_number: purchaseNumber, // 1 = primeira compra; >1 = recorrente
  }
  if (purchase.productName) custom_data.content_name = purchase.productName

  return {
    event_name: "Purchase",
    event_time: Math.floor(purchase.purchasedAt.getTime() / 1000),
    event_id: purchase.id, // evita duplicar se reenviar
    action_source: "chat",
    user_data,
    custom_data,
  }
}

export type SendResult = {
  status: "sent" | "failed" | "expired" | "skipped"
  message?: string
}

/** Envia uma compra ao Meta e grava o resultado na própria compra. */
export async function sendPurchaseEvent(purchaseId: string): Promise<SendResult> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { contact: true, user: true },
  })
  if (!purchase) return { status: "skipped", message: "Compra não encontrada" }
  if (purchase.metaEventSent) return { status: "skipped", message: "Já enviada" }

  const { user, contact } = purchase
  if (!user.metaDatasetId || !user.metaAccessToken) {
    return { status: "skipped", message: "Meta não configurado" }
  }

  // Evento com mais de 7 dias derrubaria a requisição inteira: nem tenta.
  const ageSeconds = (Date.now() - purchase.purchasedAt.getTime()) / 1000
  if (ageSeconds > MAX_AGE_SECONDS) {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: EXPIRED_MSG } })
    return { status: "expired", message: EXPIRED_MSG }
  }

  let token: string
  try {
    token = decryptSecret(user.metaAccessToken)
  } catch {
    const msg = "Não consegui abrir o token salvo. Salve o token do Meta de novo."
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: msg } })
    return { status: "failed", message: msg }
  }

  const purchaseNumber = await prisma.purchase.count({
    where: { userId: user.id, contactId: contact.id, purchasedAt: { lte: purchase.purchasedAt } },
  })

  const body: Record<string, unknown> = { data: [buildEvent({ purchase, contact, purchaseNumber })] }
  if (user.metaTestEventCode) body.test_event_code = user.metaTestEventCode

  try {
    const res = await fetch(
      `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(user.metaDatasetId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }
    )
    const json = (await res.json().catch(() => null)) as {
      events_received?: number
      fbtrace_id?: string
      error?: { message?: string; code?: number }
    } | null

    if (res.ok && json && (json.events_received ?? 0) >= 1) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          metaEventSent: true,
          metaEventId: json.fbtrace_id ?? purchase.id,
          metaSentAt: new Date(),
          metaError: null,
        },
      })
      return { status: "sent" }
    }

    const msg = (json?.error?.message ?? `Erro ${res.status} do Meta`).slice(0, 300)
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: msg } })
    return { status: "failed", message: msg }
  } catch (e) {
    const msg = (e instanceof Error ? e.message : "Falha de rede").slice(0, 300)
    await prisma.purchase.update({ where: { id: purchase.id }, data: { metaError: msg } })
    return { status: "failed", message: msg }
  }
}

/** Reenvia as compras pendentes de uma conta (as que ainda estão dentro de 7 dias). */
export async function sendPendingForUser(userId: string, limit = 50) {
  const cutoff = new Date(Date.now() - MAX_AGE_SECONDS * 1000)

  // O que já passou de 7 dias nunca mais será aceito: marca como expirado.
  await prisma.purchase.updateMany({
    where: {
      userId,
      metaEventSent: false,
      purchasedAt: { lt: cutoff },
      OR: [{ metaError: null }, { NOT: { metaError: EXPIRED_MSG } }],
    },
    data: { metaError: EXPIRED_MSG },
  })

  const pending = await prisma.purchase.findMany({
    where: { userId, metaEventSent: false, purchasedAt: { gte: cutoff } },
    orderBy: { purchasedAt: "asc" },
    take: limit,
    select: { id: true },
  })

  const summary = { sent: 0, failed: 0, skipped: 0, firstError: null as string | null }
  for (const p of pending) {
    const r = await sendPurchaseEvent(p.id)
    if (r.status === "sent") summary.sent++
    else if (r.status === "failed") {
      summary.failed++
      summary.firstError ??= r.message ?? null
    } else summary.skipped++
  }
  return summary
}

/** Mostra como o evento da última compra seria enviado (sem enviar nada). */
export async function previewLatestEvent(userId: string) {
  const purchase = await prisma.purchase.findFirst({
    where: { userId },
    orderBy: { purchasedAt: "desc" },
    include: { contact: true },
  })
  if (!purchase) return null

  const purchaseNumber = await prisma.purchase.count({
    where: { userId, contactId: purchase.contactId, purchasedAt: { lte: purchase.purchasedAt } },
  })
  const event = buildEvent({ purchase, contact: purchase.contact, purchaseNumber })
  const { fn, ln } = nameForMeta(purchase.contact.name)

  return {
    event,
    antesDoHash: {
      telefone: phoneForMeta(purchase.contact.phone),
      nome: fn ?? null,
      sobrenome: ln ?? null,
    },
  }
}
