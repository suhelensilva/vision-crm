// ─────────────────────────────────────────────────────────────────────────────
// Vision CRM — content script (roda dentro do WhatsApp Web)
//
// Coluna de ícones na direita (estilo Hotzapp) + painel que abre ao lado:
//   Conversa · Notas · Cobranças · Respostas rápidas · Painel web
// E, acima do campo de mensagem: barra de respostas rápidas + atalho ";".
//
// ⚠ PARTE FRÁGIL: os seletores do WhatsApp Web mudam de tempos em tempos.
// Se parar de detectar o nome/telefone ou de inserir texto, ajuste só
// getActivePhone(), getActiveName() e getComposer() abaixo.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_ID = "vcrm-root"
const BAR_ID = "vcrm-bar"
const POP_ID = "vcrm-pop"
const PANEL_W = 340
const RAIL_W = 56

const state = {
  open: false,
  tab: "conversa",
  phone: null,
  name: null,
  contact: null, // resposta de /api/crm/contact
  detail: null, // resposta de /api/crm/contacts/:id (dados, notas)
  charges: [],
  lists: [],
  replies: [],
  repliesQuery: "",
  myName: "",
  apiUrl: "",
  status: "idle", // idle | loading | ok | no_config | bad_token | offline
  toast: "",
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const brl = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtDate = (iso) => {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) } catch { return "—" }
}
const todayPlus = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })

function api(method, path, body) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "api", method, path, body }, (r) => resolve(r || { ok: false, status: 0 }))
    } catch {
      resolve({ ok: false, status: 0, error: "extension_reloaded" })
    }
  })
}

// Ícones (Lucide, traço)
const ICONS = {
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l8-8V5a2 2 0 0 0-2-2h-3"/><path d="M15 21v-6h6"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  text: '<path d="M21 6H3"/><path d="M15 12H3"/><path d="M17 18H3"/>',
  paperclip: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  spark: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
}
const icon = (n, s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`

// Mesmas regras de nomes e variáveis do sistema (server/src/lib/names.ts e quick-reply-vars.ts)
function cleanNameParts(name) {
  if (!name || name === "Cliente WhatsApp") return []
  return name.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter((p) => p && !/^clientes?$/i.test(p))
}
const firstName = (n) => cleanNameParts(n)[0] || ""
const fullName = (n) => cleanNameParts(n).join(" ")

function renderVariables(text) {
  const now = new Date()
  const TZ = "America/Sao_Paulo"
  const hour = parseInt(now.toLocaleString("pt-BR", { hour: "2-digit", hour12: false, timeZone: TZ }), 10)
  const greet = hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite"
  const contactName = (state.contact && state.contact.name) || state.name
  const values = {
    "{primeiro_nome}": firstName(contactName),
    "{nome_completo}": fullName(contactName),
    "{saudacao}": greet,
    "{seu_nome}": (state.myName || "").trim(),
    "{telefone}": state.phone || "",
    "{data_de_hoje}": now.toLocaleDateString("pt-BR", { timeZone: TZ }),
    "{hora_agora}": now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
  }
  let out = text
  let anyEmpty = false
  for (const [token, value] of Object.entries(values)) {
    if (!out.includes(token)) continue
    if (!value) anyEmpty = true
    out = out.split(token).join(value)
  }
  if (anyEmpty) out = out.replace(/[ \t]+([,.!?;:])/g, "$1").replace(/[ \t]{2,}/g, " ")
  return out
}

function chargeMessage(c) {
  const value = brl(c.amount)
  const due = new Date(c.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
  const who = firstName(c.contactName)
  const what = c.description && c.description.trim() ? ` (${c.description.trim()})` : ""
  const lines = [`Oi${who ? `, ${who}` : ""}! Passando pra lembrar do pagamento${what} no valor de ${value}, com vencimento em ${due}.`]
  if (c.paymentLink && c.paymentLink.trim()) lines.push("", `Pra pagar: ${c.paymentLink.trim()}`)
  lines.push("", "Qualquer dúvida é só me chamar. Obrigada!")
  return lines.join("\n")
}

// ── WhatsApp Web: conversa ativa e campo de mensagem ──────────────────────────

function getActivePhone() {
  const main = document.querySelector("#main")
  if (!main) return null
  for (const el of main.querySelectorAll("[data-id]")) {
    const id = el.getAttribute("data-id") || ""
    if (id.includes("@g.us")) return null // grupo
    const m = id.match(/_(\d+)@c\.us/)
    if (m) return m[1]
  }
  return null
}

function getActiveName() {
  const header = document.querySelector("#main header")
  if (!header) return null
  const titled = header.querySelector("span[title]")
  if (titled && titled.getAttribute("title")) return titled.getAttribute("title").trim()
  const span = header.querySelector("span[dir='auto']")
  return span ? span.textContent.trim() : null
}

function getComposer() {
  return (
    document.querySelector('#main footer div[contenteditable="true"][role="textbox"]') ||
    document.querySelector('#main footer div[contenteditable="true"]')
  )
}

/** Escreve no campo de mensagem (não envia: quem aperta Enter é ela). */
function insertIntoComposer(text) {
  const box = getComposer()
  if (!box) { toast("Abra uma conversa pra usar a mensagem."); return false }
  box.focus()
  let ok = false
  try {
    const dt = new DataTransfer()
    dt.setData("text/plain", text)
    ok = box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    // paste tratado pelo WhatsApp devolve false (preventDefault)
    ok = !ok
  } catch { ok = false }
  if (!ok) ok = document.execCommand("insertText", false, text)
  if (!ok) toast("Não consegui escrever no campo. Copiei o texto.")
  if (!ok) navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {})
  return ok
}

// ── Interface: raiz, coluna de ícones, painel ────────────────────────────────

const TABS = [
  { id: "conversa", label: "Esta conversa", icon: "user" },
  { id: "notas", label: "Notas", icon: "note" },
  { id: "cobrancas", label: "Cobranças", icon: "wallet" },
  { id: "respostas", label: "Respostas rápidas", icon: "zap" },
]

function ensureRoot() {
  let root = document.getElementById(ROOT_ID)
  if (root) return root
  root = document.createElement("div")
  root.id = ROOT_ID
  root.addEventListener("click", onClick)
  root.addEventListener("submit", onSubmit)
  root.addEventListener("input", onInput)
  document.body.appendChild(root)
  document.documentElement.classList.add("vcrm-on")
  return root
}

function applyLayout() {
  document.documentElement.style.setProperty("--vcrm-pad", `${RAIL_W + (state.open ? PANEL_W : 0)}px`)
}

function toast(msg) {
  state.toast = msg
  render()
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { state.toast = ""; render() }, 3200)
}

function render() {
  const root = ensureRoot()
  applyLayout()
  const rail = TABS.map(
    (t) => `<button class="vc-ico ${state.open && state.tab === t.id ? "on" : ""}" data-tab="${t.id}" title="${t.label}">${icon(t.icon, 20)}<span>${t.label.split(" ")[0]}</span></button>`
  ).join("")

  const active = TABS.find((t) => t.id === state.tab)
  root.innerHTML = `
    <aside class="vc-rail">
      <div class="vc-logo" title="Vision CRM">${icon("spark", 20)}</div>
      ${rail}
      <div class="vc-grow"></div>
      <button class="vc-ico" data-act="web" title="Abrir o painel web">${icon("ext", 20)}<span>Painel</span></button>
    </aside>
    ${state.open ? `
    <section class="vc-panel">
      <header class="vc-head">
        <div class="vc-title">${esc(active ? active.label : "")}</div>
        <button class="vc-x" data-act="close" title="Fechar">${icon("x", 18)}</button>
      </header>
      <div class="vc-body">${renderBody()}</div>
    </section>` : ""}
    ${state.toast ? `<div class="vc-toast">${esc(state.toast)}</div>` : ""}
  `
}

function renderBody() {
  if (state.status === "no_config") return empty("Extensão não configurada", "Clique no ícone da extensão no Chrome e informe a URL do sistema e o token (gerado em Configurações).")
  if (state.status === "bad_token") return empty("Token inválido", "Gere um token novo em Configurações no painel web e atualize na extensão.")
  if (state.status === "offline") return empty("Sem conexão", "Confira a URL do sistema no ícone da extensão. O sistema precisa estar no ar.")
  if (state.tab === "respostas") return renderReplies()
  if (!state.phone) return empty("Abra uma conversa", "Escolha uma conversa individual, com mensagens, pra ver os dados da cliente.")
  if (state.status === "loading" && !state.contact) return `<div class="vc-muted">Carregando…</div>`
  if (state.tab === "notas") return renderNotes()
  if (state.tab === "cobrancas") return renderCharges()
  return renderConversa()
}

const empty = (t, s) => `<div class="vc-empty"><b>${esc(t)}</b><p>${esc(s)}</p></div>`

// ── Aba: Esta conversa ────────────────────────────────────────────────────────

function renderConversa() {
  const c = state.contact
  if (!c) return ""
  const name = esc(c.name || state.name || "Cliente")
  const head = `
    <div class="vc-person">
      <div class="vc-avatar">${esc((fullName(c.name || state.name) || "?").slice(0, 1).toUpperCase())}</div>
      <div><div class="vc-name">${name}</div><div class="vc-sub">${esc(state.phone)}</div></div>
    </div>`

  if (!c.found) {
    return `${head}
      <div class="vc-card">
        <p class="vc-muted">Esta cliente ainda não está no CRM.</p>
        <button class="vc-btn" data-act="add-contact">${icon("plus", 15)} Adicionar ao CRM</button>
      </div>
      ${purchaseForm()}`
  }

  const s = c.stats
  const applied = c.lists || []
  const ids = new Set(applied.map((l) => l.id))
  const chips = applied.map((l) => `<span class="vc-chip" style="--c:${esc(l.color)}">${esc(l.name)}<button data-remove-list="${esc(l.id)}" title="Tirar da lista">×</button></span>`).join("")
  const free = state.lists.filter((l) => !ids.has(l.id))
  const d = state.detail && state.detail.contact
  const SOURCES = { anuncio: "Anúncio", organico: "Orgânico", indicacao: "Indicação", outro: "Outro" }

  return `${head}
    <div class="vc-tags">${chips || `<span class="vc-muted">Em nenhuma lista</span>`}</div>
    <div class="vc-add">
      <button class="vc-btn" data-act="toggle-lists">${icon("plus", 15)} Adicionar à lista</button>
      <div class="vc-menu" id="vc-listmenu" hidden>
        ${free.map((l) => `<button data-add-list="${esc(l.id)}"><i style="background:${esc(l.color)}"></i>${esc(l.name)}</button>`).join("") || `<div class="vc-muted pad">Nenhuma lista livre</div>`}
        <form class="vc-newlist" data-form="newlist"><input name="name" placeholder="Nova lista" maxlength="60" /><button class="vc-btn sm">Criar</button></form>
      </div>
    </div>

    <div class="vc-badges">
      <span class="vc-badge">${esc(s.tierLabel)}</span>
      ${s.cadenceLabel ? `<span class="vc-badge gold">${esc(s.cadenceLabel)}</span>` : ""}
      ${d && d.source ? `<span class="vc-badge">${esc(SOURCES[d.source] || d.source)}</span>` : ""}
    </div>

    <div class="vc-stats">
      <div><b>${s.count}</b><span>compras</span></div>
      <div><b>${brl(s.totalSpent)}</b><span>total</span></div>
      <div><b>${s.daysSinceLast == null ? "—" : s.daysSinceLast + "d"}</b><span>última</span></div>
    </div>

    ${purchaseForm()}

    <div class="vc-sec">Histórico</div>
    ${c.purchases.length ? c.purchases.slice(0, 15).map((p) => `
      <div class="vc-row"><div><b>${esc(p.productName || "Compra")}</b><span>${fmtDate(p.purchasedAt)}</span></div><em>${brl(p.amount)}</em></div>`).join("") : `<p class="vc-muted">Nenhuma compra registrada.</p>`}
  `
}

function purchaseForm() {
  return `
    <form class="vc-card" data-form="purchase">
      <div class="vc-sec first">Registrar compra</div>
      <input name="amount" type="number" step="0.01" min="0" placeholder="Valor (R$)" required />
      <input name="product" type="text" placeholder="Produto ou serviço (opcional)" />
      <button class="vc-btn">${icon("check", 15)} Registrar compra</button>
      <div class="vc-note" data-msg="purchase"></div>
    </form>`
}

// ── Aba: Notas ────────────────────────────────────────────────────────────────

function renderNotes() {
  const notes = (state.detail && state.detail.notes) || []
  return `
    <form class="vc-card" data-form="note">
      <textarea name="text" rows="3" maxlength="2000" placeholder="Escreva uma anotação sobre esta cliente…"></textarea>
      <button class="vc-btn">${icon("plus", 15)} Adicionar nota</button>
      <div class="vc-note" data-msg="note"></div>
    </form>
    ${notes.length ? notes.map((n) => `
      <div class="vc-card note"><div class="vc-sub">${esc(new Date(n.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }))}</div><p>${esc(n.text)}</p></div>`).join("") : `<p class="vc-muted">Nenhuma nota ainda.</p>`}
  `
}

// ── Aba: Cobranças ────────────────────────────────────────────────────────────

function renderCharges() {
  const mine = state.charges.filter((c) => state.contact && c.contactId === state.contact.contactId)
  const label = { vencida: "Vencida", pendente: "A receber", paga: "Paga", cancelada: "Cancelada" }
  return `
    <form class="vc-card" data-form="charge">
      <div class="vc-sec first">Nova cobrança</div>
      <input name="amount" type="number" step="0.01" min="0" placeholder="Valor (R$)" required />
      <input name="due" type="date" value="${todayPlus(3)}" required />
      <input name="desc" type="text" maxlength="200" placeholder="Descrição (opcional)" />
      <input name="link" type="text" maxlength="1000" placeholder="Link de pagamento ou Pix (opcional)" />
      <button class="vc-btn">${icon("plus", 15)} Criar cobrança</button>
      <div class="vc-note" data-msg="charge"></div>
    </form>
    ${mine.length ? mine.map((c) => `
      <div class="vc-card charge ${c.state}">
        <div class="vc-row flat"><div><b>${brl(c.amount)}</b><span>${esc(c.description || "Sem descrição")} · vence ${fmtDate(c.dueDate)}</span></div><span class="vc-badge ${c.state}">${label[c.state]}</span></div>
        ${c.state === "pendente" || c.state === "vencida" ? `
        <div class="vc-actions">
          <button class="vc-ghost" data-charge-send="${esc(c.id)}">${icon("send", 14)} Cobrar</button>
          <button class="vc-btn sm" data-charge-pay="${esc(c.id)}">Marcar paga</button>
          <button class="vc-ghost" data-charge-cancel="${esc(c.id)}">Cancelar</button>
        </div>` : ""}
      </div>`).join("") : `<p class="vc-muted">Nenhuma cobrança para esta cliente.</p>`}
  `
}

// ── Aba: Respostas rápidas ────────────────────────────────────────────────────

const TYPE_ICON = { TEXT: "text", CONTACT: "user", AUDIO: "paperclip", IMAGE: "paperclip", VIDEO: "paperclip", DOCUMENT: "paperclip", SEQUENCE: "list" }

function matchReplies(q) {
  const s = q.trim().toLowerCase()
  const list = state.replies.filter((r) => !s || r.name.toLowerCase().includes(s) || (r.shortcut || "").toLowerCase().includes(s) || (r.text || "").toLowerCase().includes(s))
  return list.sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.usageCount - a.usageCount)
}

function renderReplies() {
  const list = matchReplies(state.repliesQuery)
  return `
    <input class="vc-search" data-search placeholder="Buscar mensagem…" value="${esc(state.repliesQuery)}" />
    <p class="vc-hint">Clique pra escrever no campo de mensagem. Você revisa e aperta Enter. Digite <code>;</code> no campo pra buscar pelo atalho.</p>
    ${list.length ? list.map((r) => `
      <button class="vc-reply" data-reply="${esc(r.id)}">
        <span class="vc-rico">${icon(TYPE_ICON[r.type] || "text", 15)}</span>
        <span class="vc-rtxt"><b>${r.favorite ? `<i class="vc-fav">${icon("star", 12)}</i>` : ""}${esc(r.name)}${r.shortcut ? ` <code>;${esc(r.shortcut)}</code>` : ""}</b>
        <span>${esc(replyPreview(r))}</span></span>
      </button>`).join("") : `<p class="vc-muted">Nenhuma resposta encontrada. Crie no painel web, em Respostas rápidas.</p>`}
  `
}

function replyPreview(r) {
  if (r.type === "TEXT") return (r.text || "").slice(0, 90)
  if (r.type === "CONTACT") return `Cartão de contato: ${r.contactName || ""}`
  return r.mediaName ? `Arquivo: ${r.mediaName}` : "Anexo"
}

/** Usa uma resposta: texto vai pro campo; anexos ainda são feitos pelo painel web. */
async function useReply(r) {
  if (r.type === "TEXT") {
    if (insertIntoComposer(renderVariables(r.text || ""))) api("POST", `/api/crm/quick-replies/${r.id}/use`)
    return
  }
  if (r.type === "CONTACT") {
    const t = `${r.contactName || ""}: ${r.contactPhone || ""}`.trim()
    if (insertIntoComposer(t)) api("POST", `/api/crm/quick-replies/${r.id}/use`)
    return
  }
  toast("Anexos (áudio, imagem, vídeo, documento) ainda não são enviados pela extensão.")
}

// ── Barra de respostas acima do campo + atalho ";" ───────────────────────────

function ensureBar() {
  const footer = document.querySelector("#main footer")
  let bar = document.getElementById(BAR_ID)
  if (!footer || state.status === "no_config" || state.status === "bad_token") {
    if (bar) bar.remove()
    return
  }
  const top = matchReplies("").filter((r) => r.type === "TEXT" || r.type === "CONTACT").slice(0, 10)
  if (!top.length) { if (bar) bar.remove(); return }
  if (!bar) {
    bar = document.createElement("div")
    bar.id = BAR_ID
    bar.addEventListener("mousedown", (e) => e.preventDefault()) // não tira o foco do campo
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-bar-reply]")
      if (!b) return
      const r = state.replies.find((x) => x.id === b.getAttribute("data-bar-reply"))
      if (r) useReply(r)
    })
  }
  const html = top.map((r) => `<button data-bar-reply="${esc(r.id)}" title="${esc(replyPreview(r))}">${r.favorite ? icon("star", 11) : ""}${esc(r.name)}</button>`).join("")
  if (bar.dataset.sig !== html) { bar.innerHTML = html; bar.dataset.sig = html }
  if (bar.parentNode !== footer.parentNode || bar.nextSibling !== footer) footer.parentNode.insertBefore(bar, footer)
}

function closePop() { const p = document.getElementById(POP_ID); if (p) p.remove() }

function onComposerInput(e) {
  const box = getComposer()
  if (!box || e.target !== box && !box.contains(e.target)) return
  const m = box.textContent.match(/(?:^|\s);([\p{L}\d_]*)$/u)
  if (!m) return closePop()
  const q = m[1]
  const list = matchReplies("").filter((r) => r.shortcut && r.shortcut.toLowerCase().startsWith(q.toLowerCase())).slice(0, 6)
  closePop()
  if (!list.length) return
  const pop = document.createElement("div")
  pop.id = POP_ID
  pop.innerHTML = list.map((r) => `<button data-pop="${esc(r.id)}"><code>;${esc(r.shortcut)}</code> <b>${esc(r.name)}</b><span>${esc(replyPreview(r))}</span></button>`).join("")
  pop.addEventListener("mousedown", (ev) => ev.preventDefault())
  pop.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pop]")
    if (!b) return
    const r = state.replies.find((x) => x.id === b.getAttribute("data-pop"))
    closePop()
    if (!r) return
    for (let i = 0; i < q.length + 1; i++) document.execCommand("delete") // apaga ";atalho"
    useReply(r)
  })
  const footer = document.querySelector("#main footer")
  ;(footer ? footer.parentNode : document.body).insertBefore(pop, footer || null)
}

// ── Eventos do painel ────────────────────────────────────────────────────────

async function onClick(e) {
  const t = e.target.closest("button")
  if (!t) return

  if (t.dataset.tab) {
    if (state.open && state.tab === t.dataset.tab) state.open = false
    else { state.open = true; state.tab = t.dataset.tab; refresh(true) }
    return render()
  }
  const act = t.dataset.act
  if (act === "close") { state.open = false; return render() }
  if (act === "web") { if (state.apiUrl) window.open(state.apiUrl + "/dashboard/funil", "_blank"); return }
  if (act === "toggle-lists") { const m = document.getElementById("vc-listmenu"); if (m) m.hidden = !m.hidden; return }
  if (act === "add-contact") { await ensureContact(); return refresh(true) }

  if (t.dataset.addList) return changeList(t.dataset.addList, "add")
  if (t.dataset.removeList) return changeList(t.dataset.removeList, "remove")
  if (t.dataset.reply) { const r = state.replies.find((x) => x.id === t.dataset.reply); if (r) useReply(r); return }

  if (t.dataset.chargeSend) {
    const c = state.charges.find((x) => x.id === t.dataset.chargeSend)
    if (c && insertIntoComposer(chargeMessage(c))) toast("Mensagem de cobrança escrita no campo. Revise e envie.")
    return
  }
  if (t.dataset.chargePay || t.dataset.chargeCancel) {
    const id = t.dataset.chargePay || t.dataset.chargeCancel
    const action = t.dataset.chargePay ? "pay" : "cancel"
    if (action === "pay" && !confirm("Marcar como paga? Isso registra a compra e envia a conversão pro Meta.")) return
    if (action === "cancel" && !confirm("Cancelar esta cobrança?")) return
    const res = await api("PATCH", `/api/crm/charges/${id}`, { action })
    if (!res.ok) toast((res.data && res.data.error) || "Não foi possível atualizar a cobrança.")
    return refresh(true)
  }
}

async function onSubmit(e) {
  const form = e.target.closest("form[data-form]")
  if (!form) return
  e.preventDefault()
  const kind = form.dataset.form
  const f = new FormData(form)
  const msg = (m) => { const el = form.querySelector("[data-msg]"); if (el) el.textContent = m }

  if (kind === "newlist") {
    const name = String(f.get("name") || "").trim()
    if (!name) return
    const res = await api("POST", "/api/crm/lists", { name })
    if (res.ok && res.data) { state.lists.push(res.data); await changeList(res.data.id, "add") }
    return
  }

  if (kind === "purchase") {
    const amount = parseFloat(f.get("amount"))
    if (!amount || amount <= 0) return msg("Informe um valor válido.")
    msg("Registrando…")
    const res = await api("POST", "/api/crm/purchase", {
      phone: state.phone,
      name: (state.contact && state.contact.name) || state.name || undefined,
      amount,
      productName: String(f.get("product") || "") || undefined,
      source: "whatsapp",
    })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao registrar. Confira a conexão.")
  }

  const id = await ensureContact()
  if (!id) return msg("Não consegui salvar esta cliente.")

  if (kind === "note") {
    const text = String(f.get("text") || "").trim()
    if (!text) return msg("Escreva a nota.")
    const res = await api("POST", `/api/crm/contacts/${id}/notes`, { text })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao salvar a nota.")
  }

  if (kind === "charge") {
    const amount = parseFloat(f.get("amount"))
    if (!amount || amount <= 0) return msg("Informe um valor válido.")
    const res = await api("POST", "/api/crm/charges", {
      contactId: id,
      amount,
      dueDate: String(f.get("due")),
      description: String(f.get("desc") || "") || undefined,
      paymentLink: String(f.get("link") || "") || undefined,
    })
    if (res.ok) return refresh(true)
    return msg((res.data && res.data.error) || "Erro ao criar a cobrança.")
  }
}

function onInput(e) {
  if (e.target.matches("[data-search]")) {
    state.repliesQuery = e.target.value
    const pos = e.target.selectionStart
    render()
    const el = document.querySelector("#vcrm-root [data-search]")
    if (el) { el.focus(); el.setSelectionRange(pos, pos) }
  }
}

// ── Dados ────────────────────────────────────────────────────────────────────

/** Garante que a cliente exista no CRM (notas e cobranças precisam disso). */
async function ensureContact() {
  if (state.contact && state.contact.contactId) return state.contact.contactId
  const name = (state.name || "").trim() || state.phone
  const res = await api("POST", "/api/crm/contacts", { name, phone: state.phone })
  return res.ok && res.data ? res.data.id : null
}

async function changeList(listId, action) {
  const res = await api("POST", "/api/crm/contact/tags", { phone: state.phone, name: state.name || undefined, listId, action })
  if (res.ok) return refresh(true)
  toast("Não foi possível mudar a lista.")
}

async function loadShared() {
  const [lists, replies, me] = await Promise.all([
    api("GET", "/api/crm/lists"),
    api("GET", "/api/crm/quick-replies"),
    api("GET", "/api/crm/me"),
  ])
  if (lists.ok && Array.isArray(lists.data)) state.lists = lists.data
  if (replies.ok && Array.isArray(replies.data)) state.replies = replies.data
  if (me.ok && me.data) state.myName = me.data.name || ""
}

let seq = 0
async function refresh(force) {
  const phone = getActivePhone()
  const name = getActiveName()
  const changed = phone !== state.phone
  state.phone = phone
  state.name = name
  if (!force && !changed) return

  const mine = ++seq
  const cfg = await chrome.storage.local.get(["apiUrl", "token"]).catch(() => ({}))
  state.apiUrl = (cfg.apiUrl || "").replace(/\/+$/, "")
  if (!cfg.apiUrl || !cfg.token) { state.status = "no_config"; return render() }

  if (changed) { state.contact = null; state.detail = null; state.charges = [] }
  state.status = "loading"
  if (state.open) render()

  if (!state.replies.length && !state.lists.length) await loadShared()
  if (!phone) { state.status = "ok"; ensureBar(); return render() }

  const res = await api("GET", `/api/crm/contact?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name || "")}`)
  if (mine !== seq) return // chegou resposta velha: outra conversa já foi aberta
  if (res.status === 401) { state.status = "bad_token"; return render() }
  if (!(res.ok && res.data)) { state.status = "offline"; return render() }

  state.contact = res.data
  state.detail = null
  state.charges = []
  if (res.data.contactId) {
    const [d, ch] = await Promise.all([api("GET", `/api/crm/contacts/${res.data.contactId}`), api("GET", "/api/crm/charges?status=todas")])
    if (mine !== seq) return
    if (d.ok) state.detail = d.data
    if (ch.ok && ch.data) state.charges = ch.data.charges || []
  }
  state.status = "ok"
  ensureBar()
  render()
}

// ── Início ───────────────────────────────────────────────────────────────────

function startObserver() {
  const root = document.querySelector("#app") || document.body
  let timer = null
  const obs = new MutationObserver((muts) => {
    if (muts.every((m) => m.target.closest && m.target.closest(`#${ROOT_ID}, #${BAR_ID}, #${POP_ID}`))) return
    clearTimeout(timer)
    timer = setTimeout(() => { refresh(false); ensureBar() }, 400)
  })
  obs.observe(root, { childList: true, subtree: true })
  document.addEventListener("input", onComposerInput, true)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop() }, true)
  // token/URL mudaram no popup: recarrega
  chrome.storage.onChanged.addListener(() => { state.replies = []; state.lists = []; refresh(true) })
}

function init() {
  ensureRoot()
  render()
  startObserver()
  refresh(true)
}

const boot = setInterval(() => {
  if (document.querySelector("#app")) { clearInterval(boot); init() }
}, 500)
