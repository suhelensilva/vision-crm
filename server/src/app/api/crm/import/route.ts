import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getAuthUser } from "@/lib/crm-auth"
import { importFromWhatsApp } from "@/lib/import"

const schema = z.object({
  labels: z.array(z.object({ name: z.string().trim().min(1).max(60), color: z.string().max(20).optional() })).max(200),
  contacts: z
    .array(
      z.object({
        phone: z.string().max(40),
        name: z.string().max(200),
        labels: z.array(z.string().max(60)).max(30),
        unread: z.number().int().min(-1).max(100000),
        archived: z.boolean(),
        lastFromMe: z.boolean().nullable(),
        lastAt: z.number().nullable(),
      })
    )
    .max(300), // a extensão manda em lotes de até 300
})

// POST /api/crm/import -> importa etiquetas (viram listas) e contatos lidos do WhatsApp.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Token inválido" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })

  return NextResponse.json(await importFromWhatsApp(user.id, parsed.data.labels, parsed.data.contacts))
}
