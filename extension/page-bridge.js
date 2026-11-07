// Roda DENTRO da página do WhatsApp Web (mundo "MAIN"), porque o telefone da
// conversa não aparece no HTML: ele só existe nos dados internos do WhatsApp.
// Aqui só LEMOS qual conversa está aberta e o número dela. Nada é alterado nem enviado.
// Fala com o content.js por eventos: "vcrm-req" (pedido) e "vcrm-res" (resposta).
//
// ⚠ PARTE FRÁGIL: nomes de módulos internos do WhatsApp mudam. Por isso tentamos
// vários caminhos e devolvemos um "debug" dizendo o que funcionou.
(() => {
  if (window.__vcrmBridge) return
  window.__vcrmBridge = true

  const req = (name) => {
    try { return window.require ? window.require(name) : null } catch { return null }
  }
  const mask = (s) => String(s == null ? "" : s).replace(/[0-9]/g, "9").slice(0, 60)
  const digits = (s) => String(s || "").replace(/\D/g, "")

  function collections() {
    for (const n of ["WAWebCollections", "WAWebChatCollection"]) {
      const m = req(n)
      if (m) return m
    }
    return null
  }

  function findActiveChat(dbg) {
    const C = collections()
    dbg.temCollections = !!C
    if (!C) return null
    const Chat = C.Chat || C
    dbg.temChat = !!Chat
    try { if (Chat.getActive) { const c = Chat.getActive(); if (c) { dbg.via = "getActive"; return c } } } catch (e) { dbg.erroGetActive = String(e).slice(0, 80) }
    const models = Chat.models || Chat._models || (Chat.getModelsArray && Chat.getModelsArray()) || []
    dbg.qtdChats = models.length
    const act = models.find((m) => m && (m.active === true || (m.getActive && m.getActive())))
    if (act) { dbg.via = "models.active"; return act }
    return null
  }

  function widOf(x) {
    if (!x) return null
    return { user: x.user || "", server: x.server || "", ser: x._serialized || "" }
  }

  function phoneFromChat(chat, dbg) {
    const id = widOf(chat.id)
    dbg.servidor = id ? id.server : null
    if (!id) return ""
    if (id.server === "g.us") return "GROUP"
    if (id.server === "c.us" && digits(id.user)) return digits(id.user)

    // conversa por LID: procurar o número real
    const tries = []
    const C = collections()
    try { if (chat.contact && chat.contact.phoneNumber) tries.push(["chat.contact.phoneNumber", widOf(chat.contact.phoneNumber)]) } catch {}
    try { if (chat.contact && chat.contact.id && chat.contact.id.server === "c.us") tries.push(["chat.contact.id", widOf(chat.contact.id)]) } catch {}
    try {
      const Contact = C && C.Contact
      const ct = Contact && Contact.get && Contact.get(chat.id)
      if (ct && ct.phoneNumber) tries.push(["Contact.get.phoneNumber", widOf(ct.phoneNumber)])
    } catch {}
    for (const mod of ["WAWebLidMigrationUtils", "WAWebApiContact", "WAWebLidPhoneMappingUtils", "WAWebLidUtils"]) {
      const M = req(mod)
      dbg["mod_" + mod] = !!M
      if (!M) continue
      for (const fn of ["getPhoneNumber", "toPn", "lidToPn", "getPhoneNumberFromLid"]) {
        try { if (typeof M[fn] === "function") { const r = M[fn](chat.id); tries.push([mod + "." + fn, widOf(r && r.user ? r : null)]) } } catch {}
      }
    }
    dbg.tentativas = tries.map(([n, w]) => n + "=" + (w && w.user ? mask(w.user) : "vazio"))
    for (const [n, w] of tries) {
      if (w && digits(w.user) && (w.server === "c.us" || !w.server)) { dbg.via = (dbg.via || "") + "+" + n; return digits(w.user) }
    }
    return ""
  }

  function answer() {
    const dbg = {}
    let phone = ""
    let name = ""
    try {
      const chat = findActiveChat(dbg)
      dbg.achouChat = !!chat
      if (chat) {
        phone = phoneFromChat(chat, dbg)
        name = (chat.formattedTitle || chat.name || (chat.contact && (chat.contact.name || chat.contact.pushname)) || "") + ""
        dbg.chaves = Object.keys(chat).slice(0, 20)
      }
    } catch (e) { dbg.erro = String(e).slice(0, 120) }
    return { phone, name, dbg }
  }

  // ── Leitura em massa: etiquetas, contatos e estado das conversas ──
  const arr = (col) => {
    if (!col) return []
    try {
      if (typeof col.getModelsArray === "function") return col.getModelsArray()
      if (Array.isArray(col.models)) return col.models
      if (Array.isArray(col._models)) return col._models
    } catch {}
    return []
  }
  const serial = (w) => (w && (w._serialized || (w.user ? w.user + "@" + w.server : ""))) || String(w || "")

  function lastMessageOf(chat) {
    try {
      const msgs = chat.msgs
      if (msgs && typeof msgs.last === "function") return msgs.last()
      const list = arr(msgs)
      return list.length ? list[list.length - 1] : null
    } catch { return null }
  }

  function scan() {
    const dbg = { versao: "scan1" }
    const labelsOut = []
    const chatsOut = []
    let semTelefone = 0
    let grupos = 0
    try {
      const C = collections()
      dbg.temCollections = !!C
      if (!C) return { labels: labelsOut, chats: chatsOut, semTelefone, grupos, dbg }

      // etiquetas (WhatsApp Business) e quais conversas estão em cada uma
      const labelModels = arr(C.Label)
      dbg.temLabel = !!C.Label
      dbg.qtdEtiquetas = labelModels.length
      const labelsOfChat = new Map() // id da conversa -> [nomes]
      for (const l of labelModels) {
        const name = String(l.name || "").trim()
        if (!name) continue
        labelsOut.push({ name, color: typeof l.hexColor === "string" ? l.hexColor : undefined })
        const items = arr(l.labelItemCollection)
        for (const it of items) {
          if (it.parentType && it.parentType !== "Chat") continue
          const key = serial(it.parentId)
          if (!key) continue
          if (!labelsOfChat.has(key)) labelsOfChat.set(key, [])
          labelsOfChat.get(key).push(name)
        }
      }
      dbg.conversasComEtiqueta = labelsOfChat.size

      const chats = arr(C.Chat)
      dbg.qtdConversas = chats.length
      const sample = []
      for (const chat of chats) {
        const id = chat && chat.id
        const server = id && id.server
        if (!id) continue
        if (server === "g.us" || chat.isGroup) { grupos++; continue }
        if (server !== "c.us" && server !== "lid") continue // lista de transmissão, canal, status...
        const throwaway = {}
        const phone = phoneFromChat(chat, throwaway)
        if (!phone || phone === "GROUP") { semTelefone++; if (sample.length < 3) sample.push(throwaway.tentativas || throwaway.servidor); continue }

        const last = lastMessageOf(chat)
        const lastAtSec = (last && last.t) || chat.t || 0
        const lastFromMe = last && last.id ? !!last.id.fromMe : null
        const name = String(chat.formattedTitle || chat.name || (chat.contact && (chat.contact.name || chat.contact.pushname)) || "").trim()
        const myLabels = new Set([...(labelsOfChat.get(serial(id)) || [])])
        chatsOut.push({
          phone,
          name: name && !/^[+\d\s()-]+$/.test(name) ? name : "",
          labels: [...myLabels],
          unread: typeof chat.unreadCount === "number" ? Math.max(0, chat.unreadCount) : 0,
          archived: !!chat.archive,
          lastFromMe,
          lastAt: lastAtSec ? lastAtSec * 1000 : null,
        })
      }
      dbg.amostraSemTelefone = sample
    } catch (e) { dbg.erro = String(e).slice(0, 160) }
    return { labels: labelsOut, chats: chatsOut, semTelefone, grupos, dbg }
  }

  document.addEventListener("vcrm-req", (ev) => {
    let id = ev.detail
    let kind = "chat"
    try { const d = JSON.parse(ev.detail); if (d && typeof d === "object") { id = d.id; kind = d.kind || "chat" } } catch {}
    const out = kind === "scan" ? scan() : answer()
    document.dispatchEvent(new CustomEvent("vcrm-res", { detail: JSON.stringify({ id, ...out }) }))
  })
})()
