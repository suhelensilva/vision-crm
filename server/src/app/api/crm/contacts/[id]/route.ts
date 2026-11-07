import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  nextStep: z.string().trim().max(200).nullable().optional(), // null ou "" apaga
  nextStepAt: z.string().nullable().optional(), // "YYYY-MM-DD" ou ISO; null ou "" apaga
})

/**
 * "2026-11-10" vira meio-dia de Brasília (15:00 UTC), pra o dia nunca "voltar"
 * pro dia anterior por causa do fuso.
 */
function parseDue(value: string): Date | null {
  const v = value.trim()
  if (!v) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T15:00:00Z`) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// PATCH /api/crm/contacts/[id] -> renomeia e/ou define o próximo passo com prazo.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  const { name, nextStep, nextStepAt } = parsed.data

  let due: Date | null | undefined = undefined
  if (nextStepAt !== undefined) {
    due = nextStepAt === null ? null : parseDue(nextStepAt)
    if (nextStepAt && due === null) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 })
    }
  }

  const clearStep = nextStep !== undefined && !nextStep
  const updated = await prisma.contact.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(nextStep !== undefined && { nextStep: nextStep || null }),
      // apagar o texto do passo também apaga o prazo
      ...(clearStep ? { nextStepAt: null } : due !== undefined ? { nextStepAt: due } : {}),
      lastActivityAt: new Date(),
    },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    nextStep: updated.nextStep,
    nextStepAt: updated.nextStepAt?.toISOString() ?? null,
  })
}
