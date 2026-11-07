// ─────────────────────────────────────────────────────────────────────────────
// Vision CRM — content script (roda dentro do WhatsApp Web)
// Injeta um painel lateral que mostra o histórico de compras da cliente aberta.
//
// ⚠ PARTE FRÁGIL: os seletores do WhatsApp Web mudam de tempos em tempos.
// Se o painel parar de detectar nome/telefone, ajuste as funções
// getActivePhone() e getActiveName() abaixo — é só o que costuma quebrar.
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_ID = "tcrm-panel"
let lastPhone = null
let currentContact = null
let allLists = []

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]))
}

function brl(n) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(iso) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
  } catch {
    return "—"
  }
}

function api(method, path, body) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "api", method, path, body }, resolve)
  })
}

// ── Detecção da conversa ativa ────────────────────────────────────────────────

// Telefone: lido do atributo data-id das mensagens (formato fromMe_<jid>_<msgId>).
// Chat individual = <numero>@c.us ; grupo = ...@g.us (ignoramos grupos).
function getActivePhone() {
  const main = document.querySelector("#main")
  if (!main) return null
  const nodes = main.querySelectorAll("[data-id]")
  for (const el of nodes) {
    const id = el.getAttribute("data-id") || ""
    if (id.includes("@g.us")) return null // grupo
    const m = id.match(/_(\d+)@c\.us/)
    if (m) return m[1]
  }
  return null
}

// Nome: título no header da conversa. Tenta várias formas.
function getActiveName() {
  const header = document.querySelector("#main header")
  if (!header) return null
  const titled = header.querySelector("span[title]")
  if (titled && titled.getAttribute("title")) return titled.getAttribute("title").trim()
  const span = header.querySelector("span[dir='auto']")
  return span ? span.textContent.trim() : null
}

// ── Painel ────────────────────────────────────────────────────────────────────

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID)
  if (panel) return panel

  panel = document.createElement("div")
  panel.id = PANEL_ID
  panel.className = "tcrm-panel tcrm-collapsed"
  panel.innerHTML = `
    <button class="tcrm-fab" title="Abrir CRM">✦</button>
    <div class="tcrm-body">
      <div class="tcrm-header">
        <span class="tcrm-logo">✦ Vision CRM</span>
        <button class="tcrm-close" title="Fechar">×</button>
      </div>
      <div class="tcrm-content"></div>
    </div>
  `
  document.body.appendChild(panel)

  panel.querySelector(".tcrm-fab").addEventListener("click", () => {
    panel.classList.remove("tcrm-collapsed")
    refresh(true)
  })
  panel.querySelector(".tcrm-close").addEventListener("click", () => {
    panel.classList.add("tcrm-collapsed")
  })
  return panel
}

function setContent(html) {
  const panel = ensurePanel()
  panel.querySelector(".tcrm-content").innerHTML = html
}

function renderNotConfigured() {
  setContent(`
    <div class="tcrm-empty">
      <p class="tcrm-empty-title">Extensão não configurada</p>
      <p class="tcrm-empty-sub">Clique no ícone da extensão no Chrome e informe a URL do sistema e o token (gerado em Configurações).</p>
    </div>
  `)
}

function renderNoChat() {
  setContent(`
    <div class="tcrm-empty">
      <p class="tcrm-empty-title">Abra uma conversa</p>
      <p class="tcrm-empty-sub">Selecione uma conversa individual (com mensagens) pra ver o histórico da cliente.</p>
    </div>
  `)
}

function tierColor(tier) {
  return {
    novo: "#6b7280",
    primeira: "#0ea5e9",
    recorrente: "#8b5cf6",
    fiel: "#d946ef",
    vip: "#f59e0b",
  }[tier] || "#6b7280"
}

function renderContact(contact, phone, name) {
  const s = contact.stats
  const displayName = esc(contact.name || name || "Cliente")
  const history = contact.purchases.length
    ? contact.purchases.map((p) => `
        <div class="tcrm-hist-row">
          <div>
            <div class="tcrm-hist-prod">${esc(p.productName || "Compra")}</div>
            <div class="tcrm-hist-date">${fmtDate(p.purchasedAt)}</div>
          </div>
          <div class="tcrm-hist-amount">${brl(p.amount)}</div>
        </div>`).join("")
    : `<p class="tcrm-muted">Nenhuma compra registrada ainda.</p>`

  setContent(`
    <div class="tcrm-contact">
      <div class="tcrm-name">${displayName}</div>
      <div class="tcrm-phone">${esc(phone)}</div>
      <span class="tcrm-tier" style="background:${tierColor(s.tier)}">${esc(s.tierLabel)}</span>
      ${s.cadenceLabel ? `<span class="tcrm-cadence">${esc(s.cadenceLabel)}</span>` : ""}
    </div>

    <div class="tcrm-tags" id="tcrm-tags"></div>

    <div class="tcrm-stats">
      <div class="tcrm-stat"><div class="tcrm-stat-num">${s.count}</div><div class="tcrm-stat-lbl">compras</div></div>
      <div class="tcrm-stat"><div class="tcrm-stat-num">${brl(s.totalSpent)}</div><div class="tcrm-stat-lbl">total gasto</div></div>
      <div class="tcrm-stat"><div class="tcrm-stat-num">${s.daysSinceLast == null ? "—" : s.daysSinceLast + "d"}</div><div class="tcrm-stat-lbl">última compra</div></div>
    </div>

    <form class="tcrm-form" id="tcrm-form">
      <div class="tcrm-form-title">Registrar compra</div>
      <input id="tcrm-amount" type="number" step="0.01" min="0" placeholder="Valor (R$)" required />
      <input id="tcrm-product" type="text" placeholder="Produto / serviço (opcional)" />
      <button type="submit">Registrar compra</button>
      <div class="tcrm-form-msg" id="tcrm-form-msg"></div>
    </form>

    <div class="tcrm-hist">
      <div class="tcrm-hist-title">Histórico</div>
      ${history}
    </div>
  `)

  renderTags(contact, phone, name)

  const form = document.getElementById("tcrm-form")
  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const amount = parseFloat(document.getElementById("tcrm-amount").value)
    const productName = document.getElementById("tcrm-product").value
    const msg = document.getElementById("tcrm-form-msg")
    if (!amount || amount <= 0) {
      msg.textContent = "Informe um valor válido."
      return
    }
    msg.textContent = "Registrando..."
    const res = await api("POST", "/api/crm/purchase", {
      phone,
      name: contact.name || name || undefined,
      amount,
      productName: productName || undefined,
      source: "whatsapp",
    })
    if (res && res.ok && res.data) {
      currentContact = res.data
      renderContact(res.data, phone, name)
    } else {
      msg.textContent = "Erro ao registrar. Confira a conexão na extensão."
    }
  })
}

// ── Etiquetas / Listas ─────────────────────────────────────────────────────────

async function loadLists() {
  const res = await api("GET", "/api/crm/lists")
  if (res && res.ok && Array.isArray(res.data)) {
    allLists = res.data
  }
}

function renderTags(contact, phone, name) {
  const container = document.getElementById("tcrm-tags")
  if (!container) return

  const applied = contact.lists || []
  const appliedIds = new Set(applied.map((l) => l.id))

  const chips = applied.map((l) => `
    <span class="tcrm-chip" style="background:${l.color}">
      ${esc(l.name)}<span class="tcrm-chip-x" data-remove="${l.id}">×</span>
    </span>`).join("")

  const available = allLists.filter((l) => !appliedIds.has(l.id))
  const menuItems = available.length
    ? available.map((l) => `
        <div class="tcrm-tagmenu-item" data-add="${l.id}">
          <span class="tcrm-dot" style="background:${l.color}"></span>${esc(l.name)}
        </div>`).join("")
    : `<div class="tcrm-muted" style="padding:6px 8px">Nenhuma etiqueta livre</div>`

  container.innerHTML = `
    <div class="tcrm-chips">
      ${chips}
      <button class="tcrm-addtag" id="tcrm-addtag">+ etiqueta</button>
    </div>
    <div class="tcrm-tagmenu" id="tcrm-tagmenu" style="display:none">
      ${menuItems}
      <div class="tcrm-tagmenu-new">
        <input id="tcrm-newlist" placeholder="Nova etiqueta" maxlength="60" />
        <button id="tcrm-newlist-btn">Criar</button>
      </div>
    </div>
  `

  container.querySelectorAll("[data-remove]").forEach((el) =>
    el.addEventListener("click", () => toggleTag(phone, name, el.getAttribute("data-remove"), "remove"))
  )
  container.querySelectorAll("[data-add]").forEach((el) =>
    el.addEventListener("click", () => toggleTag(phone, name, el.getAttribute("data-add"), "add"))
  )

  document.getElementById("tcrm-addtag").addEventListener("click", () => {
    const m = document.getElementById("tcrm-tagmenu")
    m.style.display = m.style.display === "none" ? "block" : "none"
  })

  document.getElementById("tcrm-newlist-btn").addEventListener("click", async () => {
    const input = document.getElementById("tcrm-newlist")
    const nm = (input.value || "").trim()
    if (!nm) return
    const res = await api("POST", "/api/crm/lists", { name: nm })
    if (res && res.ok && res.data) {
      allLists.push(res.data)
      await toggleTag(phone, name, res.data.id, "add")
    }
  })
}

async function toggleTag(phone, name, listId, action) {
  const res = await api("POST", "/api/crm/contact/tags", {
    phone,
    name: name || undefined,
    listId,
    action,
  })
  if (res && res.ok && res.data) {
    currentContact = res.data
    renderContact(res.data, phone, name)
  }
}

// ── Fluxo principal ───────────────────────────────────────────────────────────

async function refresh(force) {
  const panel = ensurePanel()
  if (panel.classList.contains("tcrm-collapsed")) return // painel fechado, nem busca

  const phone = getActivePhone()
  const name = getActiveName()

  if (!phone) {
    lastPhone = null
    renderNoChat()
    return
  }

  if (!force && phone === lastPhone) return // nada mudou
  lastPhone = phone

  setContent(`<div class="tcrm-loading">Carregando…</div>`)

  const res = await api("GET", `/api/crm/contact?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name || "")}`)

  if (res && res.error === "not_configured") {
    renderNotConfigured()
    return
  }
  if (res && res.status === 401) {
    setContent(`<div class="tcrm-empty"><p class="tcrm-empty-title">Token inválido</p><p class="tcrm-empty-sub">Gere um token novo em Configurações e atualize na extensão.</p></div>`)
    return
  }
  if (res && res.ok && res.data) {
    if (allLists.length === 0) await loadLists()
    currentContact = res.data
    renderContact(res.data, phone, name)
  } else {
    setContent(`<div class="tcrm-empty"><p class="tcrm-empty-title">Sem conexão</p><p class="tcrm-empty-sub">Verifique a URL do sistema na extensão (ele precisa estar rodando).</p></div>`)
  }
}

// Observa trocas de conversa (WhatsApp troca o conteúdo de #app sem recarregar a página).
function startObserver() {
  const root = document.querySelector("#app") || document.body
  let timer = null
  const obs = new MutationObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(() => refresh(false), 400)
  })
  obs.observe(root, { childList: true, subtree: true })
}

function init() {
  ensurePanel()
  startObserver()
}

// WhatsApp Web demora pra montar; espera o #app aparecer.
const boot = setInterval(() => {
  if (document.querySelector("#app")) {
    clearInterval(boot)
    init()
  }
}, 500)
