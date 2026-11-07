import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import {
  SHORTCUT_TAKEN, categoryField, contactNameField, contactPhoneField, isUniqueViolation,
  nameField, shortcutField, textField, toView,
} from "@/lib/quick-replies"

const schema = z.object({
  name: nameField.optional(),
  category: categoryField,
  shortcut: shortcutField,
  favorite: z.boolean().optional(),
  text: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
})

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos"

// PATCH /api/crm/quick-replies/[id] -> edita. O tipo não muda (pra trocar, crie outra).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const current = await prisma.quickReply.findFirst({ where: { id, userId: user.id } })
  if (!current) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })
  const d = parsed.data

  const data: Record<string, unknown> = {}
  if (d.name !== undefined) data.name = d.name
  if (d.category !== undefined) data.category = d.category
  if (d.shortcut !== undefined) data.shortcut = d.shortcut
  if (d.favorite !== undefined) data.favorite = d.favorite

  if (d.text !== undefined) {
    if (current.type !== "TEXT") return NextResponse.json({ error: "Esta resposta não tem texto." }, { status: 400 })
    const t = textField.safeParse(d.text)
    if (!t.success) return NextResponse.json({ error: firstIssue(t.error) }, { status: 400 })
    data.text = t.data
  }
  if (d.contactName !== undefined || d.contactPhone !== undefined) {
    if (current.type !== "CONTACT") return NextResponse.json({ error: "Esta resposta não é um contato." }, { status: 400 })
    if (d.contactName !== undefined) {
      const n = contactNameField.safeParse(d.contactName)
      if (!n.success) return NextResponse.json({ error: firstIssue(n.error) }, { status: 400 })
      data.contactName = n.data
    }
    if (d.contactPhone !== undefined) {
      const p = contactPhoneField.safeParse(d.contactPhone)
      if (!p.success) return NextResponse.json({ error: firstIssue(p.error) }, { status: 400 })
      data.contactPhone = p.data
    }
  }

  try {
    const updated = await prisma.quickReply.update({ where: { id }, data })
    return NextResponse.json(toView(updated))
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: SHORTCUT_TAKEN }, { status: 409 })
    throw e
  }
}

// DELETE /api/crm/quick-replies/[id]
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const res = await prisma.quickReply.deleteMany({ where: { id, userId: user.id } })
  if (res.count === 0) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
