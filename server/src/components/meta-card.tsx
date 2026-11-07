"use client"

import { useCallback, useEffect, useState } from "react"
import { Send } from "lucide-react"
import { PasswordInput } from "@/components/password-input"
import { btn, card, chip, chipTone, field, ghost, inner, label } from "@/lib/ui"

type MetaConfig = {
  datasetId: string
  hasToken: boolean
  tokenHint: string | null
  testEventCode: string
  graphVersion: string
}

type MetaEvent = {
  id: string
  contactName: string
  amount: number
  productName: string | null
  purchasedAt: string
  status: "enviado" | "pendente" | "falhou" | "expirado"
  error: string | null
}

const STATUS: Record<MetaEvent["status"], { tone: keyof typeof chipTone; label: string }> = {
  enviado: { tone: "ok", label: "Enviado" },
  pendente: { tone: "wait", label: "Pendente" },
  falhou: { tone: "late", label: "Falhou" },
  expirado: { tone: "mute", label: "Expirado" },
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })

export function MetaCard() {
  const [cfg, setCfg] = useState<MetaConfig | null>(null)
  const [datasetId, setDatasetId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [testCode, setTestCode] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [events, setEvents] = useState<MetaEvent[]>([])
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    const r = await fetch("/api/crm/meta/events")
    if (r.ok) setEvents(await r.json())
  }, [])

  useEffect(() => {
    fetch("/api/crm/meta")
      .then((r) => r.json())
      .then((d: MetaConfig) => {
        setCfg(d)
        setDatasetId(d.datasetId)
        setTestCode(d.testEventCode)
      })
      .catch(() => {})
    loadEvents().catch(() => {})
  }, [loadEvents])

  async function save() {
    setSaving(true)
    setMsg(null)
    const res = await fetch("/api/crm/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId, accessToken, testEventCode: testCode }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setMsg({ ok: false, text: d.error || "Não consegui salvar." })
      return
    }
    setAccessToken("")
    setMsg({ ok: true, text: "Salvo." })
    const fresh = await fetch("/api/crm/meta").then((r) => r.json())
    setCfg(fresh)
  }

  async function clearToken() {
    await fetch("/api/crm/meta", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId, clearToken: true, testEventCode: testCode }),
    })
    setCfg(await fetch("/api/crm/meta").then((r) => r.json()))
    setMsg({ ok: true, text: "Token removido." })
  }

  async function sendPending() {
    setSending(true)
    setMsg(null)
    const res = await fetch("/api/crm/meta/send-pending", { method: "POST" })
    const d = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) {
      setMsg({ ok: false, text: d.error || "Erro ao enviar." })
    } else {
      const parts = [`${d.sent} enviado(s)`, `${d.failed} falhou(aram)`]
      setMsg({ ok: d.failed === 0, text: parts.join(", ") + (d.firstError ? `. Motivo: ${d.firstError}` : "") })
    }
    await loadEvents()
  }

  async function showPreview() {
    const res = await fetch("/api/crm/meta/preview")
    const d = await res.json().catch(() => ({}))
    setPreview(res.ok ? JSON.stringify(d, null, 2) : d.error || "Sem prévia.")
  }

  return (
    <div style={{ ...card, padding: 24 }}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px", color: "var(--strong)" }}>Conversões pro Meta</h2>
      <p style={hint}>
        Cada compra registrada vira um evento <b>Purchase</b> no seu Pixel, com valor, data e o telefone da
        cliente criptografado. Se for a 2ª compra em diante, o evento leva a contagem (<code>purchase_number</code>).
        O Meta só aceita eventos de até <b>7 dias</b>.
      </p>

      <label style={label}>ID do Pixel (conjunto de dados)</label>
      <input
        value={datasetId}
        onChange={(e) => setDatasetId(e.target.value)}
        placeholder="só números, ex: 1234567890123456"
        style={{ ...field, padding: "9px 12px" }}
      />

      <label style={label}>
        Token de acesso {cfg?.hasToken && <span style={{ color: "var(--ok)" }}>(salvo: {cfg.tokenHint})</span>}
      </label>
      <PasswordInput
        value={accessToken}
        onChange={setAccessToken}
        placeholder={cfg?.hasToken ? "deixe vazio pra manter o atual" : "cole o token de acesso"}
      />

      <label style={label}>Código de teste (opcional)</label>
      <input
        value={testCode}
        onChange={(e) => setTestCode(e.target.value)}
        placeholder="ex: TEST12345"
        style={{ ...field, padding: "9px 12px" }}
      />
      <p style={{ ...hint, fontSize: 12, marginTop: 6 }}>
        Atenção: eventos com código de teste aparecem em &quot;Testar eventos&quot;, mas o Meta ainda os usa na
        medição. Deixe vazio no dia a dia.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button onClick={save} disabled={saving} style={{ ...btn, opacity: saving ? 0.6 : 1 }}>{saving ? "Salvando..." : "Salvar"}</button>
        {cfg?.hasToken && <button onClick={clearToken} style={ghost}>Remover token</button>}
        <button onClick={sendPending} disabled={sending} style={ghost}>
          <Send size={14} style={{ verticalAlign: -2, marginRight: 5 }} />{sending ? "Enviando..." : "Reenviar pendentes"}
        </button>
        <button onClick={showPreview} style={ghost}>Ver o que seria enviado</button>
      </div>

      {msg && <p style={{ fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--danger)" }}>{msg.text}</p>}

      {preview && <pre style={pre}>{preview}</pre>}

      <h3 style={{ fontSize: 14, margin: "22px 0 8px", color: "var(--vred)", letterSpacing: 1 }}>ÚLTIMAS COMPRAS</h3>
      {events.length === 0 ? (
        <p style={{ ...hint, fontStyle: "italic" }}>Nenhuma compra registrada ainda.</p>
      ) : (
        <div>
          {events.map((e, i) => {
            const s = STATUS[e.status]
            return (
              <div key={e.id} style={{ ...row, borderTop: i === 0 ? "none" : "1px solid var(--soft)" }} title={e.error ?? ""}>
                <span style={{ width: 44, color: "var(--muted)", fontSize: 12 }}>{fmt(e.purchasedAt)}</span>
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                  {e.contactName}{e.productName ? ` · ${e.productName}` : ""}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, marginRight: 10, color: "var(--strong)" }}>{brl(e.amount)}</span>
                <span style={chip(s.tone)}>{s.label}</span>
              </div>
            )
          })}
          {events.some((e) => e.error && e.status === "falhou") && (
            <p style={{ ...hint, fontSize: 12, color: "var(--danger)" }}>
              Último erro: {events.find((e) => e.status === "falhou")?.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const hint: React.CSSProperties = { fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 4px" }
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "9px 0" }
const pre: React.CSSProperties = { ...inner, padding: 12, fontSize: 11, overflow: "auto", maxHeight: 260, color: "var(--text-2)" }
