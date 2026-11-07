import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { decryptSecret, encryptSecret } from "@/lib/crypto"
import { META_GRAPH_VERSION } from "@/lib/meta"

// GET: configuração atual do Meta. O token NUNCA volta inteiro, só os 4 últimos caracteres.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { metaDatasetId: true, metaAccessToken: true, metaTestEventCode: true },
  })

  let tokenHint: string | null = null
  if (user?.metaAccessToken) {
    try {
      tokenHint = "••••" + decryptSecret(user.metaAccessToken).slice(-4)
    } catch {
      tokenHint = "(ilegível, salve de novo)"
    }
  }

  return NextResponse.json({
    datasetId: user?.metaDatasetId ?? "",
    hasToken: Boolean(user?.metaAccessToken),
    tokenHint,
    testEventCode: user?.metaTestEventCode ?? "",
    graphVersion: META_GRAPH_VERSION,
  })
}

const schema = z.object({
  datasetId: z.string().trim().regex(/^\d{5,25}$/, "O ID do Pixel tem só números").or(z.literal("")),
  accessToken: z.string().trim().max(1000).optional(), // vazio = mantém o atual
  clearToken: z.boolean().optional(),
  testEventCode: z.string().trim().max(50).optional(),
})

// PUT: salva a configuração.
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
  }
  const data = parsed.data

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      metaDatasetId: data.datasetId || null,
      metaTestEventCode: data.testEventCode || null,
      ...(data.clearToken
        ? { metaAccessToken: null }
        : data.accessToken
          ? { metaAccessToken: encryptSecret(data.accessToken) }
          : {}),
    },
  })

  return NextResponse.json({ ok: true })
}
