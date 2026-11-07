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

  document.addEventListener("vcrm-req", (ev) => {
    const out = answer()
    document.dispatchEvent(new CustomEvent("vcrm-res", { detail: JSON.stringify({ id: ev.detail, ...out }) }))
  })
})()
