"use client"

import { useCallback, useEffect, useState } from "react"
import type { getContactDetail } from "@/lib/contact-detail"
import { SOURCES, SOURCE_LABEL } from "@/lib/sources"
import { withCountryCode } from "@/lib/phone"

type Detail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>
type Tab = "dados" | "notas" | "historico"

const TZ = "America/Sao_Paulo"
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ })
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

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

export function ContactDrawer({
  contactId, onClose, onChanged,
}: {
  contactId: string
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("dados")

  // campos de "Dados do lead"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState("")
  const [birth, setBirth] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // notas
  const [noteText, setNoteText] = useState("")
  const [addingNote, setAddingNote] = useState(false)

  const load = useCallback(async () => {
    try {
      const d: Detail = await call("GET", `/api/crm/contacts/${contactId}`)
      setDetail(d)
      setName(d.contact.name)
      setEmail(d.contact.email ?? "")
      setSource(d.contact.source ?? "")
      setBirth(d.contact.birthDate ?? "")
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar a cliente.")
    }
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function saveData() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await call("PATCH", `/api/crm/contacts/${contactId}`, {
        name,
        email,
        source: source || null,
        birthDate: birth || null,
      })
      setSaved(true)
      await load()
      await onChanged()
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function addNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    setError(null)
    try {
      await call("POST", `/api/crm/contacts/${contactId}/notes`, { text: noteText })
      setNoteText("")
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar a nota.")
    } finally {
      setAddingNote(false)
    }
  }

  async function removeNote(id: string) {
    if (!confirm("Apagar esta nota? Não dá pra desfazer.")) return
    try {
      await call("DELETE", `/api/crm/notes/${id}`)
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui apagar.")
    }
  }

  const s = detail?.crm.stats

  return (
    <div style={overlay} onClick={onClose}>
      <aside style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {detail?.contact.name ?? "Carregando..."}
            </div>
            {detail && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {detail.contact.phone} ·{" "}
                <a href={`https://wa.me/${withCountryCode(detail.contact.phone)}`} target="_blank" rel="noreferrer">
                  Abrir conversa
                </a>
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" style={closeBtn}>×</button>
        </div>

        {detail && s && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <span style={chip("#6d28d9", "#f3e8ff")}>{s.tierLabel}</span>
            {s.cadenceLabel && <span style={chip("#92400e", "#fef3c7")}>{s.cadenceLabel}</span>}
            {detail.crm.lists.map((l) => (
              <span key={l.id} style={{ ...chip("#fff", l.color) }}>{l.name}</span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 4, margin: "14px 0 12px", borderBottom: "1px solid #ede9fe" }}>
          {([
            ["dados", "Dados"],
            ["notas", `Notas${detail ? ` (${detail.notes.length})` : ""}`],
            ["historico", "Histórico"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "8px 12px",
                fontSize: 13, fontWeight: 600,
                color: tab === id ? "#6d28d9" : "#6b7280",
                borderBottom: `2px solid ${tab === id ? "#7c3aed" : "transparent"}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}

        {!detail ? (
          !error && <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando...</p>
        ) : tab === "dados" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={label}>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={input} />

            <label style={label}>Telefone</label>
            <input value={detail.contact.phone} readOnly style={{ ...input, background: "#f9fafb", color: "#6b7280" }} />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>O número identifica a cliente. Pra trocar, crie outro contato.</span>

            <label style={label}>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" style={input} />

            <label style={label}>Origem</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} style={input}>
              <option value="">Não informada</option>
              {SOURCES.map((o) => (
                <option key={o} value={o}>{SOURCE_LABEL[o]}</option>
              ))}
            </select>

            <label style={label}>Nascimento</label>
            <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} style={input} />

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button onClick={saveData} disabled={saving || !name.trim()} style={btn}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>Salvo.</span>}
            </div>
          </div>
        ) : tab === "notas" ? (
          <div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote() }}
              placeholder="Escreva uma anotação sobre esta cliente..."
              rows={3}
              maxLength={2000}
              style={{ ...input, width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 16px" }}>
              <button onClick={addNote} disabled={addingNote || !noteText.trim()} style={btn}>
                {addingNote ? "Salvando..." : "Adicionar nota"}
              </button>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>Ctrl+Enter também salva</span>
            </div>

            {detail.notes.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Nenhuma nota ainda.</p>
            ) : (
              detail.notes.map((n) => (
                <div key={n.id} style={noteBox}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af", flex: 1 }}>{dayTime(n.createdAt)}</span>
                    <button onClick={() => removeNote(n.id)} title="Apagar nota" style={{ ...closeBtn, fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.text}</div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            {s && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                <Stat value={String(s.count)} label="compras" />
                <Stat value={brl(s.totalSpent)} label="total gasto" />
                <Stat value={s.daysSinceLast == null ? "—" : `${s.daysSinceLast}d`} label="última compra" />
              </div>
            )}
            {detail.crm.purchases.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Nenhuma compra registrada.</p>
            ) : (
              detail.crm.purchases.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontSize: 14 }}>{p.productName || "Compra"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{day(p.purchasedAt)}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{brl(p.amount)}</div>
                </div>
              ))
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: "#faf5ff", border: "1px solid #f0e6ff", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#6d28d9" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#8b7a9e", marginTop: 2 }}>{label}</div>
    </div>
  )
}

const chip = (fg: string, bg: string): React.CSSProperties => ({
  color: fg, background: bg, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
})

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(31,41,55,0.35)", zIndex: 50, display: "flex", justifyContent: "flex-end" }
const panel: React.CSSProperties = { width: 400, maxWidth: "100vw", height: "100%", overflowY: "auto", background: "#fff", padding: 20, boxShadow: "-8px 0 30px rgba(0,0,0,0.15)" }
const closeBtn: React.CSSProperties = { background: "none", border: "none", color: "#9ca3af", fontSize: 24, cursor: "pointer", lineHeight: 1 }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, marginTop: 8 }
const input: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" }
const btn: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
const noteBox: React.CSSProperties = { background: "#faf5ff", border: "1px solid #f0e6ff", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }
