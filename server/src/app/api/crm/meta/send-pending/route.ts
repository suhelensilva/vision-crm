import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendPendingForUser } from "@/lib/meta"

// POST: reenvia ao Meta as compras que ficaram pendentes ou falharam (até 7 dias atrás).
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { metaDatasetId: true, metaAccessToken: true },
  })
  if (!user?.metaDatasetId || !user.metaAccessToken) {
    return NextResponse.json({ error: "Configure o Pixel e o token antes de enviar." }, { status: 400 })
  }

  return NextResponse.json(await sendPendingForUser(session.user.id))
}
