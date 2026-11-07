import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getUserFromToken, normalizePhone } from "@/lib/crm-auth"
import { buildContact, findContactByPhone } from "@/lib/crm"

const schema = z.object({
  phone: z.string().min(1),
  name: z.string().optional(),
  amount: z.number().positive(),
  productName: z.string().optional(),
  source: z.enum(["whatsapp", "manual", "ad"]).optional(),
  ctwaClid: z.string().optional(),
  purchasedAt: z.string().optional(),
})

// POST /api/crm/purchase -> registra compra (cria o contato se não existir).
export async function POST(req: NextRequest) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  let data: z.infer<typeof schema>
  try {
    data = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  if (!normalizePhone(data.phone)) {
    return NextResponse.json({ error: "Telefone inválido" }, { status: 400 })
  }

  let contact = await findContactByPhone(user.id, data.phone)
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        userId: user.id,
        name: data.name?.trim() || "Cliente WhatsApp",
        phone: normalizePhone(data.phone),
      },
    })
  } else if (data.name?.trim() && (contact.name === "Cliente WhatsApp" || !contact.name)) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: data.name.trim() },
    })
  }

  await prisma.purchase.create({
    data: {
      userId: user.id,
      contactId: contact.id,
      amount: data.amount,
      productName: data.productName?.trim() || null,
      source: data.source ?? "whatsapp",
      ctwaClid: data.ctwaClid || null,
      purchasedAt: data.purchasedAt ? new Date(data.purchasedAt) : undefined,
    },
  })

  return NextResponse.json(await buildContact(user.id, contact.id), { status: 201 })
}
