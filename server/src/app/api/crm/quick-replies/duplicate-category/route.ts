import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { MAX_QUICK_REPLIES, normalizeCategory } from "@/lib/quick-replies"
import { isMediaKind } from "@/lib/quick-reply-types"
import { accountQuotaError } from "@/lib/quick-reply-files"

const body = z.object({
  // categoria de origem; null = "Sem categoria"
  category: z.string().max(60).nullable(),
  // nome da categoria nova (opcional: sem nome vira "<ORIGEM> (CÓPIA)")
  newName: z.string().max(60).optional(),
})

// POST /api/crm/quick-replies/duplicate-category -> copia a categoria inteira:
// todas as respostas dela vão para uma categoria nova, na mesma ordem.
// Igual ao "Duplicar" de uma resposta: sem atalho (é único), sem favorito, uso zerado,
// e os arquivos são copiados (contam no limite de espaço da conta).
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })

  const source = normalizeCategory(parsed.data.category)
  const src = await prisma.quickReply.findMany({
    where: { userId: user.id, category: source },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })
  const copyable = src.filter((r) => r.type !== "SEQUENCE")
  if (copyable.length === 0) return NextResponse.json({ error: "Essa categoria não tem respostas pra copiar." }, { status: 400 })

  // Nome da categoria nova: o que ela digitou ou "<ORIGEM> (CÓPIA)"; se já existir, numera.
  const base = normalizeCategory(parsed.data.newName) ?? `${source ?? "SEM CATEGORIA"} (CÓPIA)`
  const existing = new Set(
    (await prisma.quickReply.findMany({ where: { userId: user.id, category: { not: null } }, select: { category: true }, distinct: ["category"] }))
      .map((r) => r.category as string),
  )
  let target = base.slice(0, 40)
  for (let n = 2; existing.has(target); n++) {
    const suffix = ` ${n}`
    target = base.slice(0, 40 - suffix.length) + suffix
  }

  const count = await prisma.quickReply.count({ where: { userId: user.id } })
  if (count + copyable.length > MAX_QUICK_REPLIES) {
    return NextResponse.json({ error: `Não cabe: o limite é de ${MAX_QUICK_REPLIES} respostas rápidas (você tem ${count}).` }, { status: 400 })
  }

  // Arquivos (áudio, imagem, vídeo, documento)
  const mediaIds = copyable.filter((r) => isMediaKind(r.type)).map((r) => r.id)
  const files = mediaIds.length
    ? await prisma.quickReplyFile.findMany({ where: { quickReplyId: { in: mediaIds } } })
    : []
  const fileById = new Map(files.map((f) => [f.quickReplyId, f.data]))
  const missing = mediaIds.filter((id) => !fileById.has(id))
  if (missing.length) return NextResponse.json({ error: "O arquivo de alguma resposta desta categoria não foi encontrado." }, { status: 409 })
  const extraBytes = copyable.reduce((s, r) => s + (isMediaKind(r.type) ? (r.mediaSize ?? fileById.get(r.id)?.length ?? 0) : 0), 0)
  if (extraBytes > 0) {
    const quota = await accountQuotaError(user.id, extraBytes)
    if (quota) return NextResponse.json({ error: quota }, { status: 400 })
  }

  const last = await prisma.quickReply.aggregate({ where: { userId: user.id }, _max: { position: true } })
  let pos = (last._max.position ?? -1) + 1

  await prisma.$transaction(
    copyable.map((r) => {
      const data = fileById.get(r.id)
      return prisma.quickReply.create({
        data: {
          userId: user.id,
          type: r.type,
          name: r.name,
          category: target,
          text: r.text,
          contactName: r.contactName,
          contactPhone: r.contactPhone,
          mediaName: r.mediaName,
          mediaMime: r.mediaMime,
          mediaSize: r.mediaSize,
          viewOnce: r.viewOnce,
          asVoiceNote: r.asVoiceNote,
          position: pos++,
          ...(data ? { file: { create: { data } } } : {}),
        },
        select: { id: true },
      })
    }),
  )

  return NextResponse.json({ category: target, copied: copyable.length, skipped: src.length - copyable.length }, { status: 201 })
}
