import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/crm-auth"
import { MAX_QUICK_REPLIES, toView } from "@/lib/quick-replies"

// POST /api/crm/quick-replies/[id]/duplicate -> cópia sem atalho (o atalho é único),
// com uso zerado e sem favorito. Só dos tipos que já existem (Texto e Contato).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await ctx.params
  const src = await prisma.quickReply.findFirst({ where: { id, userId: user.id } })
  if (!src) return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 })
  if (src.type !== "TEXT" && src.type !== "CONTACT") {
    return NextResponse.json({ error: "Este tipo ainda não pode ser duplicado." }, { status: 400 })
  }

  const count = await prisma.quickReply.count({ where: { userId: user.id } })
  if (count >= MAX_QUICK_REPLIES) {
    return NextResponse.json({ error: `Limite de ${MAX_QUICK_REPLIES} respostas rápidas.` }, { status: 400 })
  }
  const last = await prisma.quickReply.aggregate({ where: { userId: user.id }, _max: { position: true } })

  const copy = await prisma.quickReply.create({
    data: {
      userId: user.id,
      type: src.type,
      name: `${src.name} (cópia)`.slice(0, 80),
      category: src.category,
      text: src.text,
      contactName: src.contactName,
      contactPhone: src.contactPhone,
      position: (last._max.position ?? -1) + 1,
    },
  })
  return NextResponse.json(toView(copy), { status: 201 })
}
