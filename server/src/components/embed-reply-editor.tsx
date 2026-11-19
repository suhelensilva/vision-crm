"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { EditorModal, type Editor } from "@/components/quick-replies-board"
import type { QuickReplyView } from "@/lib/quick-replies"

/**
 * A mesma janela de criar/editar resposta rápida do painel, mas sozinha numa
 * janelinha. É a que a extensão abre em cima do WhatsApp (sem levar pro painel).
 */
export function EmbedReplyEditor() {
  const params = useSearchParams()
  const id = params.get("id")
  const text = params.get("text") || ""
  const [items, setItems] = useState<QuickReplyView[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/crm/quick-replies")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Entre no Vision CRM no navegador para continuar."))))
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Não consegui carregar."))
  }, [])

  if (error) return <p style={{ padding: 24, color: "var(--text)" }}>{error}</p>
  if (!items) return <p style={{ padding: 24, color: "var(--muted)" }}>Carregando…</p>

  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))]
  const item = id ? items.find((i) => i.id === id) : null
  const editor: Editor = item ? { mode: "edit", item } : { mode: "new", kind: null, text }
  const done = () => window.close()

  return <EditorModal editor={editor} categories={categories} onClose={done} onSaved={async () => done()} />
}
