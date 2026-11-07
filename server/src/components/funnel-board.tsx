"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Funnel, FunnelCard, FunnelColumn } from "@/lib/funnel"
import { withCountryCode } from "@/lib/phone"

const TZ = "America/Sao_Paulo"
const COLORS = ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6", "#a855f7"]
const IDLE_DAYS = 3

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ })
const dateInput = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ })

type StepFilter = "todos" | "atrasado" | "hoje" | "nenhum"
type Drag = { contactId: string; fromId: string | null } | null

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

export function FunnelBoard() {
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [stepFilter, setStepFilter] = useState<StepFilter>("todos")
  const [onlyIdle, setOnlyIdle] = useState(false)
  const [drag, setDrag] = useState<Drag>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [addContactFor, setAddContactFor] = useState<string | "none" | null>(null)
  const [showNewList, setShowNewList] = useState(false)

  const load = useCallback(async () => {
    try {
      setFunnel(await call("GET", "/api/crm/funnel"))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui carregar o funil.")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const matches = useCallback(
    (c: FunnelCard) => {
      const q = search.trim().toLowerCase()
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q.replace(/\D/g, "") || "§")) return false
      if (stepFilter !== "todos" && c.nextStepState !== stepFilter) return false
      if (onlyIdle && c.daysIdle < IDLE_DAYS) return false
      return true
    },
    [search, stepFilter, onlyIdle]
  )

  async function moveCard(contactId: string, fromId: string | null, toId: string | null) {
    if (fromId === toId) return

    // Atualiza a tela na hora; depois confere com o servidor.
    setFunnel((prev) => {
      if (!prev) return prev
      const source = fromId ? prev.lists.find((l) => l.id === fromId) : null
      const card = (source ? source.cards : prev.unassigned.cards).find((c) => c.id === contactId)
      if (!card) return prev
      const without = (cards: FunnelCard[]) => cards.filter((c) => c.id !== contactId)
      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id === fromId) return { ...l, total: l.total - 1, cards: without(l.cards) }
          if (l.id === toId) return { ...l, total: l.total + 1, cards: [card, ...without(l.cards)] }
          return l
        }),
        unassigned: fromId
          ? prev.unassigned
          : { total: prev.unassigned.total - 1, cards: without(prev.unassigned.cards) },
      }
    })

    try {
      await call("POST", "/api/crm/funnel/move", { contactId, fromListId: fromId, toListId: toId })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui mover.")
    }
    await load()
  }

  function onDrop(colId: string | null) {
    if (drag) moveCard(drag.contactId, drag.fromId, colId)
    setDrag(null)
    setOverCol(null)
  }

  const visibleCount = useMemo(() => {
    if (!funnel) return 0
    const ids = new Set<string>()
    for (const col of [...funnel.lists, funnel.unassigned]) col.cards.filter(matches).forEach((c) => ids.add(c.id))
    return ids.size
  }, [funnel, matches])

  if (!funnel) {
    return <p style={{ padding: 24, color: error ? "#dc2626" : "#6b7280" }}>{error ?? "Carregando o funil..."}</p>
  }

  const filtering = search.trim() !== "" || stepFilter !== "todos" || onlyIdle

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Barra de ferramentas */}
      <div style={toolbar}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou número"
          style={{ ...field, width: 240 }}
        />
        <select value={stepFilter} onChange={(e) => setStepFilter(e.target.value as StepFilter)} style={field}>
          <option value="todos">Próximo passo: todos</option>
          <option value="atrasado">Atrasado</option>
          <option value="hoje">Para hoje</option>
          <option value="nenhum">Nenhum</option>
        </select>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={onlyIdle} onChange={(e) => setOnlyIdle(e.target.checked)} />
          Paradas ({IDLE_DAYS}+ dias)
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {filtering ? `${visibleCount} de ` : ""}
          {funnel.totals.contacts} contatos · {brl(funnel.totals.totalSpent)} em compras
        </span>
        <button onClick={() => setAddContactFor("none")} style={btn}>+ Contato</button>
        <button onClick={() => setShowNewList((v) => !v)} style={ghost}>+ Lista</button>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0" }}>{error}</p>}
      {funnel.truncated && (
        <p style={{ color: "#b45309", fontSize: 12, margin: "8px 0" }}>
          Mostrando só os 2000 contatos mais recentes.
        </p>
      )}

      {showNewList && (
        <NewListForm
          nextColor={COLORS[funnel.lists.length % COLORS.length]}
          onDone={async (err) => {
            if (err) setError(err)
            else {
              setShowNewList(false)
              await load()
            }
          }}
        />
      )}

      {addContactFor && (
        <AddContactForm
          lists={funnel.lists}
          initialListId={addContactFor === "none" ? "" : addContactFor}
          onClose={() => setAddContactFor(null)}
          onDone={async () => {
            setAddContactFor(null)
            await load()
          }}
        />
      )}

      {/* Quadro */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", overflowX: "auto", paddingBottom: 16 }}>
        <Column
          id={null}
          name="Sem lista"
          color="#9ca3af"
          total={funnel.unassigned.total}
          cards={funnel.unassigned.cards.filter(matches)}
          over={overCol === "__none"}
          onOver={() => setOverCol("__none")}
          onDrop={() => onDrop(null)}
          onDragStart={(id) => setDrag({ contactId: id, fromId: null })}
          onDragEnd={() => { setDrag(null); setOverCol(null) }}
          onChanged={load}
          onError={setError}
        />
        {funnel.lists.map((l) => (
          <Column
            key={l.id}
            id={l.id}
            name={l.name}
            color={l.color}
            total={l.total}
            cards={l.cards.filter(matches)}
            over={overCol === l.id}
            onOver={() => setOverCol(l.id)}
            onDrop={() => onDrop(l.id)}
            onDragStart={(id) => setDrag({ contactId: id, fromId: l.id })}
            onDragEnd={() => { setDrag(null); setOverCol(null) }}
            onChanged={load}
            onError={setError}
            onAddContact={() => setAddContactFor(l.id)}
          />
        ))}
      </div>

      {funnel.lists.length === 0 && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Crie sua primeira lista em <b>+ Lista</b> (ex.: Novos, Em conversa, Compradoras) e arraste os contatos entre elas.
        </p>
      )}
    </div>
  )
}

/* ───────────── Coluna ───────────── */

type ColumnProps = {
  id: string | null
  name: string
  color: string
  total: number
  cards: FunnelCard[]
  over: boolean
  onOver: () => void
  onDrop: () => void
  onDragStart: (contactId: string) => void
  onDragEnd: () => void
  onChanged: () => Promise<void>
  onError: (msg: string) => void
  onAddContact?: () => void
}

function Column(p: ColumnProps) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(p.name)

  async function rename() {
    if (!p.id || !newName.trim()) return
    try {
      await call("PATCH", `/api/crm/lists/${p.id}`, { name: newName.trim() })
      setRenaming(false)
      await p.onChanged()
    } catch (e) {
      p.onError(e instanceof Error ? e.message : "Não consegui renomear.")
    }
  }

  async function remove() {
    if (!p.id) return
    if (!confirm(`Excluir a lista "${p.name}"? Os contatos não são apagados, só saem desta lista.`)) return
    try {
      await call("DELETE", `/api/crm/lists/${p.id}`)
      await p.onChanged()
    } catch (e) {
      p.onError(e instanceof Error ? e.message : "Não consegui excluir.")
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); p.onOver() }}
      onDrop={(e) => { e.preventDefault(); p.onDrop() }}
      style={{
        width: 290, flexShrink: 0, background: p.over ? "#ede9fe" : "#f5f3ff",
        border: `1px solid ${p.over ? "#a78bfa" : "#e9e3ff"}`, borderRadius: 14, padding: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, position: "relative" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
        {renaming ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(false) }}
            onBlur={rename}
            style={{ ...field, flex: 1, padding: "3px 6px" }}
          />
        ) : (
          <strong style={{ fontSize: 14, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.name}
          </strong>
        )}
        <span style={{ fontSize: 12, color: "#6b7280" }}>{p.total}</span>
        {p.onAddContact && (
          <button onClick={p.onAddContact} title="Adicionar contato nesta lista" style={iconBtn}>+</button>
        )}
        {p.id && (
          <button onClick={() => setMenu((v) => !v)} style={iconBtn} title="Opções da lista">⋯</button>
        )}
        {menu && (
          <div style={popup}>
            <button style={popupItem} onClick={() => { setMenu(false); setRenaming(true) }}>Renomear</button>
            <button style={{ ...popupItem, color: "#dc2626" }} onClick={() => { setMenu(false); remove() }}>
              Excluir lista
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
        {p.cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            onDragStart={() => p.onDragStart(c.id)}
            onDragEnd={p.onDragEnd}
            onChanged={p.onChanged}
            onError={p.onError}
          />
        ))}
        {p.cards.length === 0 && (
          <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", margin: "10px 0" }}>
            {p.total > 0 ? "Nenhum card neste filtro" : "Arraste contatos pra cá"}
          </p>
        )}
        {p.total > p.cards.length && p.cards.length > 0 && (
          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: 0 }}>
            +{p.total - p.cards.length} não exibidos
          </p>
        )}
      </div>
    </div>
  )
}

/* ───────────── Card ───────────── */

const STEP_STYLE = {
  atrasado: { bg: "#fee2e2", fg: "#b91c1c" },
  hoje: { bg: "#fef3c7", fg: "#92400e" },
  futuro: { bg: "#e5e7eb", fg: "#374151" },
  nenhum: { bg: "#e5e7eb", fg: "#374151" },
} as const

function CardView({
  card, onDragStart, onDragEnd, onChanged, onError,
}: {
  card: FunnelCard
  onDragStart: () => void
  onDragEnd: () => void
  onChanged: () => Promise<void>
  onError: (m: string) => void
}) {
  const [mode, setMode] = useState<null | "buy" | "step" | "charge">(null)
  const [amount, setAmount] = useState("")
  const [product, setProduct] = useState("")
  const [chAmount, setChAmount] = useState("")
  const [chDue, setChDue] = useState(() => dateInput(new Date().toISOString()))
  const [chDesc, setChDesc] = useState("")
  const [chLink, setChLink] = useState("")
  const [step, setStep] = useState(card.nextStep ?? "")
  const [due, setDue] = useState(card.nextStepAt ? dateInput(card.nextStepAt) : "")
  const [busy, setBusy] = useState(false)

  const idle = card.daysIdle >= IDLE_DAYS
  const ss = STEP_STYLE[card.nextStepState]

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setMode(null)
      await onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : "Algo deu errado.")
    } finally {
      setBusy(false)
    }
  }

  function saveBuy() {
    const value = parseFloat(amount.replace(",", "."))
    if (!value || value <= 0) return onError("Informe um valor maior que zero.")
    run(async () => {
      await call("POST", `/api/crm/contacts/${card.id}/purchase`, { amount: value, productName: product || undefined })
      setAmount("")
      setProduct("")
    })
  }

  function saveStep() {
    run(() => call("PATCH", `/api/crm/contacts/${card.id}`, { nextStep: step, nextStepAt: due || null }))
  }

  function saveCharge() {
    const value = parseFloat(chAmount.replace(",", "."))
    if (!value || value <= 0) return onError("Informe um valor maior que zero.")
    if (!chDue) return onError("Informe o vencimento.")
    run(async () => {
      await call("POST", "/api/crm/charges", {
        contactId: card.id,
        amount: value,
        dueDate: chDue,
        description: chDesc || undefined,
        paymentLink: chLink || undefined,
      })
      setChAmount("")
      setChDesc("")
      setChLink("")
    })
  }

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.id); e.dataTransfer.effectAllowed = "move"; onDragStart() }}
      onDragEnd={onDragEnd}
      style={{
        background: "#fff", borderRadius: 10, padding: "10px 12px", cursor: "grab",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        borderLeft: `4px solid ${idle ? "#f59e0b" : "#ddd6fe"}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</strong>
        <a
          href={`https://wa.me/${withCountryCode(card.phone)}`}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          style={{ fontSize: 12, whiteSpace: "nowrap", textDecoration: "none" }}
        >
          Abrir conversa ›
        </a>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{card.phone}</div>

      <div style={{ fontSize: 12, marginTop: 6, color: card.purchases ? "#166534" : "#9ca3af" }}>
        {card.purchases
          ? `${brl(card.totalSpent)} · ${card.purchases} ${card.purchases === 1 ? "compra" : "compras"}`
          : "Sem compras ainda"}
      </div>

      {card.chargesDue && (
        <div
          title="Abra a página Cobranças pra ver os detalhes"
          style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: card.chargesDue.overdue ? "#b91c1c" : "#92400e" }}
        >
          {card.chargesDue.overdue
            ? `Vencida: ${brl(card.chargesDue.overdueTotal)}` +
              (card.chargesDue.total > card.chargesDue.overdueTotal
                ? ` · a receber: ${brl(card.chargesDue.total - card.chargesDue.overdueTotal)}`
                : "")
            : `A receber: ${brl(card.chargesDue.total)}`}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
        <button style={link} onClick={() => setMode(mode === "buy" ? null : "buy")}>+ compra</button>
        <button style={link} onClick={() => setMode(mode === "charge" ? null : "charge")}>Cobrar</button>
        {card.nextStepState === "nenhum" ? (
          <button style={link} onClick={() => setMode(mode === "step" ? null : "step")}>+ próximo passo</button>
        ) : (
          <button
            onClick={() => setMode(mode === "step" ? null : "step")}
            title="Editar próximo passo"
            style={{
              background: ss.bg, color: ss.fg, border: "none", borderRadius: 999,
              fontSize: 11, fontWeight: 700, padding: "2px 8px", cursor: "pointer", maxWidth: 200,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {card.nextStepState === "atrasado" ? "Atrasado · " : card.nextStepState === "hoje" ? "Hoje · " : ""}
            {card.nextStep || "Passo"}
            {card.nextStepAt ? ` (${shortDate(card.nextStepAt)})` : ""}
          </button>
        )}
        {idle && <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>Parada há {card.daysIdle} dias</span>}
      </div>

      {mode === "buy" && (
        <div style={form}>
          <input
            autoFocus type="text" inputMode="decimal" placeholder="Valor (R$)" value={amount}
            onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveBuy()}
            style={field}
          />
          <input type="text" placeholder="Produto (opcional)" value={product} onChange={(e) => setProduct(e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} onClick={saveBuy} style={btnSm}>{busy ? "..." : "Registrar"}</button>
            <button onClick={() => setMode(null)} style={ghostSm}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "charge" && (
        <div style={form}>
          <input
            autoFocus type="text" inputMode="decimal" placeholder="Valor a cobrar (R$)" value={chAmount}
            onChange={(e) => setChAmount(e.target.value)} style={field}
          />
          <label style={{ fontSize: 11, color: "#6b7280" }}>Vencimento</label>
          <input type="date" value={chDue} onChange={(e) => setChDue(e.target.value)} style={field} />
          <input type="text" placeholder="Descrição (opcional)" value={chDesc} onChange={(e) => setChDesc(e.target.value)} style={field} />
          <input type="text" placeholder="Link de pagamento ou Pix (opcional)" value={chLink} onChange={(e) => setChLink(e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} onClick={saveCharge} style={btnSm}>{busy ? "..." : "Criar cobrança"}</button>
            <button onClick={() => setMode(null)} style={ghostSm}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "step" && (
        <div style={form}>
          <input
            autoFocus type="text" placeholder="Ex: mandar áudio, cobrar" value={step}
            onChange={(e) => setStep(e.target.value)} style={field}
          />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 6 }}>
            <button disabled={busy} onClick={saveStep} style={btnSm}>{busy ? "..." : "Salvar"}</button>
            {card.nextStepState !== "nenhum" && (
              <button
                disabled={busy}
                onClick={() => run(() => call("PATCH", `/api/crm/contacts/${card.id}`, { nextStep: null }))}
                style={ghostSm}
              >
                Concluir
              </button>
            )}
            <button onClick={() => setMode(null)} style={ghostSm}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────── Formulários ───────────── */

function NewListForm({ nextColor, onDone }: { nextColor: string; onDone: (error?: string) => void }) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(nextColor)
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await call("POST", "/api/crm/lists", { name: name.trim(), color })
      onDone()
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Não consegui criar a lista.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={panel}>
      <input autoFocus placeholder="Nome da lista (ex: Compradoras)" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()} style={{ ...field, width: 240 }} />
      <div style={{ display: "flex", gap: 6 }}>
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`}
            style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer",
              border: color === c ? "3px solid #1f2937" : "2px solid #fff", boxShadow: "0 0 0 1px #d1d5db" }} />
        ))}
      </div>
      <button onClick={create} disabled={busy || !name.trim()} style={btn}>{busy ? "Criando..." : "Criar lista"}</button>
    </div>
  )
}

function AddContactForm({
  lists, initialListId, onClose, onDone,
}: {
  lists: FunnelColumn[]
  initialListId: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [listId, setListId] = useState(initialListId)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setErr(null)
    try {
      await call("POST", "/api/crm/contacts", { name, phone, listId: listId || null })
      await onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não consegui criar.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={panel}>
      <input autoFocus placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ ...field, width: 180 }} />
      <input placeholder="Telefone com DDD (ex: 11999998888)" value={phone} onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()} style={{ ...field, width: 250 }} />
      <select value={listId} onChange={(e) => setListId(e.target.value)} style={field}>
        <option value="">Sem lista</option>
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button onClick={create} disabled={busy || !name.trim() || !phone.trim()} style={btn}>{busy ? "Criando..." : "Adicionar"}</button>
      <button onClick={onClose} style={ghost}>Cancelar</button>
      {err && <span style={{ color: "#dc2626", fontSize: 12 }}>{err}</span>}
    </div>
  )
}

/* ───────────── Estilos ───────────── */

const toolbar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }
const panel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff", border: "1px solid #ede9fe", borderRadius: 12, padding: 12, marginBottom: 14 }
const field: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff" }
const btn: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
const ghost: React.CSSProperties = { background: "transparent", color: "#6d28d9", border: "1px solid #c4b5fd", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
const btnSm: React.CSSProperties = { ...btn, padding: "5px 10px", fontSize: 12 }
const ghostSm: React.CSSProperties = { ...ghost, padding: "5px 10px", fontSize: 12 }
const link: React.CSSProperties = { background: "none", border: "none", color: "#6d28d9", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }
const form: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f3f4f6" }
const iconBtn: React.CSSProperties = { background: "transparent", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "0 4px" }
const popup: React.CSSProperties = { position: "absolute", top: 26, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 6px 16px rgba(0,0,0,0.12)", zIndex: 10, display: "flex", flexDirection: "column", minWidth: 130 }
const popupItem: React.CSSProperties = { background: "none", border: "none", textAlign: "left", padding: "8px 12px", fontSize: 13, cursor: "pointer" }
