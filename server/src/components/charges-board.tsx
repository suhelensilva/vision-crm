"use client"

import { useCallback, useEffect, useState } from "react"
import type { ChargeFilter, ChargeState, ChargeSummary, ChargeView } from "@/lib/charges"
import { buildChargeMessage, whatsappLink } from "@/lib/charge-message"

const TZ = "America/Sao_Paulo"
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ })
const todayInput = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ })

const TABS: { id: ChargeFilter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "a_receber", label: "A receber" },
  { id: "vencidas", label: "Vencidas" },
  { id: "pagas", label: "Pagas" },
]

const STATE_STYLE: Record<ChargeState, { bg: string; fg: string; label: string }> = {
  pendente: { bg: "#fef3c7", fg: "#92400e", label: "A receber" },
  vencida: { bg: "#fee2e2", fg: "#b91c1c", label: "Vencida" },
  paga: { bg: "#dcfce7", fg: "#166534", label: "Paga" },
  cancelada: { bg: "#e5e7eb", fg: "#374151", label: "Cancelada" },
}

type ContactHit = { id: string; name: string; phone: string }

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

export function ChargesBoard() {
  const [tab, setTab] = useState<ChargeFilter>("todas")
  const [charges, setCharges] = useState<ChargeView[] | null>(null)
  const [summary, setSummary] = useState<ChargeSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (filter: ChargeFilter) => {
    try {
      const d = await call("GET", `/api/crm/charges?status=${filter}`)
      setCharges(d.charges)
      setSummary(d.summary)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar as cobranças.")
    }
  }, [])

  useEffect(() => {
    load(tab)
  }, [tab, load])

  async function act(c: ChargeView, action: "pay" | "cancel") {
    const msg =
      action === "pay"
        ? `Marcar como paga a cobrança de ${brl(c.amount)} de ${c.contactName}?\n\nIsso registra a compra e envia a conversão ao Meta (se estiver configurado).`
        : `Cancelar a cobrança de ${brl(c.amount)} de ${c.contactName}?`
    if (!confirm(msg)) return
    setBusyId(c.id)
    try {
      await call("PATCH", `/api/crm/charges/${c.id}`, { action })
      await load(tab)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado.")
      await load(tab)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ color: "#6d28d9", margin: 0, fontSize: 22, flex: 1 }}>Cobranças</h1>
        <button onClick={() => setShowForm((v) => !v)} style={btn}>+ Cobrança</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <SummaryCard label="A receber" color="#92400e" bg="#fffbeb" value={summary?.aReceber} />
        <SummaryCard label="Vencidas" color="#b91c1c" bg="#fef2f2" value={summary?.vencidas} />
        <SummaryCard label="Recebidas" color="#166534" bg="#f0fdf4" value={summary?.pagas} />
      </div>

      {showForm && (
        <NewChargeForm
          onClose={() => setShowForm(false)}
          onDone={async () => {
            setShowForm(false)
            await load(tab)
          }}
        />
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "1px solid " + (tab === t.id ? "#7c3aed" : "#e5e7eb"),
              background: tab === t.id ? "#f3e8ff" : "#fff", color: tab === t.id ? "#6d28d9" : "#6b7280",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 6px 20px rgba(124,58,237,0.08)" }}>
        {charges === null ? (
          <p style={empty}>Carregando...</p>
        ) : charges.length === 0 ? (
          <p style={empty}>
            Nenhuma cobrança aqui. Crie a primeira em <b>+ Cobrança</b> ou pelo botão <b>Cobrar</b> de um card do funil.
          </p>
        ) : (
          charges.map((c) => {
            const s = STATE_STYLE[c.state]
            const open = c.state === "pendente" || c.state === "vencida"
            const text = buildChargeMessage({
              name: c.contactName, amount: c.amount, dueDate: c.dueDate,
              description: c.description, paymentLink: c.paymentLink,
            })
            return (
              <div key={c.id} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.contactName}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.description || "Sem descrição"} · {c.contactPhone}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 96 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{brl(c.amount)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {c.state === "paga" && c.paidAt ? `paga em ${shortDate(c.paidAt)}` : `vence ${shortDate(c.dueDate)}`}
                  </div>
                </div>
                <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, minWidth: 74, textAlign: "center" }}>
                  {s.label}
                </span>
                {open ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 250 }}>
                    <a href={whatsappLink(c.contactPhone, text)} target="_blank" rel="noreferrer" style={{ ...ghostSm, textDecoration: "none" }}>
                      Cobrar no WhatsApp
                    </a>
                    <button disabled={busyId === c.id} onClick={() => act(c, "pay")} style={btnSm}>
                      {busyId === c.id ? "..." : "Marcar paga"}
                    </button>
                    <button disabled={busyId === c.id} onClick={() => act(c, "cancel")} style={ghostSm}>Cancelar</button>
                  </div>
                ) : (
                  <div style={{ minWidth: 250 }} />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label, color, bg, value,
}: {
  label: string
  color: string
  bg: string
  value?: { count: number; total: number }
}) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value ? brl(value.total) : "..."}</div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        {value ? `${value.count} ${value.count === 1 ? "cobrança" : "cobranças"}` : ""}
      </div>
    </div>
  )
}

function NewChargeForm({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<ContactHit[]>([])
  const [contact, setContact] = useState<ContactHit | null>(null)
  const [amount, setAmount] = useState("")
  const [due, setDue] = useState(todayInput())
  const [desc, setDesc] = useState("")
  const [link, setLink] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Busca de cliente (espera 300 ms depois da última tecla)
  useEffect(() => {
    if (contact) return
    const t = setTimeout(async () => {
      try {
        setHits(await call("GET", `/api/crm/contacts?q=${encodeURIComponent(q)}`))
      } catch {
        setHits([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, contact])

  async function create() {
    setErr(null)
    if (!contact) return setErr("Escolha a cliente.")
    const value = parseFloat(amount.replace(",", "."))
    if (!value || value <= 0) return setErr("Informe um valor maior que zero.")
    setBusy(true)
    try {
      await call("POST", "/api/crm/charges", {
        contactId: contact.id, amount: value, dueDate: due,
        description: desc || undefined, paymentLink: link || undefined,
      })
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui criar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #ede9fe", borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {contact ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <b>{contact.name}</b> <span style={{ color: "#6b7280" }}>{contact.phone}</span>
          <button onClick={() => { setContact(null); setQ("") }} style={{ ...ghostSm, marginLeft: "auto" }}>Trocar</button>
        </div>
      ) : (
        <div>
          <input autoFocus placeholder="Buscar cliente por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...field, width: "100%" }} />
          <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 4 }}>
            {hits.map((h) => (
              <button key={h.id} onClick={() => setContact(h)} style={hit}>
                {h.name} <span style={{ color: "#9ca3af" }}>{h.phone}</span>
              </button>
            ))}
            {hits.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 2px" }}>Nenhuma cliente encontrada. Crie o contato no Funil primeiro.</p>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input placeholder="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...field, width: 130 }} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={field} />
        <input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...field, flex: 1, minWidth: 180 }} />
      </div>
      <input placeholder="Link de pagamento ou Pix copia-e-cola (opcional, vai na mensagem)" value={link} onChange={(e) => setLink(e.target.value)} style={field} />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={create} disabled={busy} style={btn}>{busy ? "Criando..." : "Criar cobrança"}</button>
        <button onClick={onClose} style={ghost}>Cancelar</button>
        {err && <span style={{ color: "#dc2626", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  )
}

const empty: React.CSSProperties = { padding: 24, textAlign: "center", color: "#6b7280", fontSize: 14, margin: 0 }
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }
const field: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" }
const btn: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
const ghost: React.CSSProperties = { background: "transparent", color: "#6d28d9", border: "1px solid #c4b5fd", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
const btnSm: React.CSSProperties = { ...btn, padding: "5px 10px", fontSize: 12 }
const ghostSm: React.CSSProperties = { ...ghost, padding: "5px 10px", fontSize: 12 }
const hit: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 8px", fontSize: 13, cursor: "pointer", borderRadius: 6 }
