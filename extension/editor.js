// Janela de criar / editar resposta rápida, desenhada dentro do WhatsApp Web.
// É a cópia da janela do painel do Vision (mesmos tipos, campos e regras).
// Usa esc() e icon() do content.js (mesmo ambiente de scripts da extensão).

const ED_TYPES = [
  { id: "TEXT", label: "Texto", icon: "text" },
  { id: "AUDIO", label: "Áudio", icon: "mic" },
  { id: "IMAGE", label: "Imagem", icon: "image" },
  { id: "VIDEO", label: "Vídeo", icon: "film" },
  { id: "DOCUMENT", label: "Documento", icon: "file" },
  { id: "CONTACT", label: "Contato", icon: "user" },
]
const ED_TITLES = {
  TEXT: ["Nova mensagem de texto", "Editar mensagem de texto"],
  AUDIO: ["Novo áudio", "Editar áudio"],
  IMAGE: ["Nova imagem", "Editar imagem"],
  VIDEO: ["Novo vídeo", "Editar vídeo"],
  DOCUMENT: ["Novo documento", "Editar documento"],
  CONTACT: ["Novo contato", "Editar contato"],
}
const ED_MEDIA = {
  AUDIO: { exts: ["ogg", "mp3"], accept: ".ogg,.mp3,audio/ogg,audio/mpeg", formats: ".ogg, .mp3", caption: false },
  IMAGE: { exts: ["png", "jpg", "jpeg", "webp"], accept: ".png,.jpg,.jpeg,.webp", formats: ".png, .jpg, .webp", caption: true },
  VIDEO: { exts: ["mp4", "3gp"], accept: ".mp4,.3gp,video/mp4,video/3gpp", formats: ".mp4, .3gp", caption: true },
  DOCUMENT: { exts: null, accept: "", formats: ".pdf, .doc, .xls, .csv, .zip e outros", caption: true },
}
const ED_BLOCKED = ["exe", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "vbe", "js", "jse", "jar", "dll", "apk", "sh", "lnk", "reg", "hta", "cpl", "html", "htm", "svg", "xhtml"]
const ED_MAX_BYTES = 4 * 1024 * 1024
const ED_VARS = [
  ["{primeiro_nome}", "Primeiro nome"], ["{nome_completo}", "Nome completo"], ["{saudacao}", "Saudação"],
  ["{seu_nome}", "Seu nome"], ["{telefone}", "Telefone"], ["{data_de_hoje}", "Data de hoje"], ["{hora_agora}", "Hora agora"],
]

const edBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB")
const edExt = (name) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name).trim()); return m ? m[1].toLowerCase() : "" }

function edSample(text) {
  const h = new Date().getHours()
  const map = {
    "{primeiro_nome}": "Maria", "{nome_completo}": "Maria da Silva", "{saudacao}": h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite",
    "{seu_nome}": "Seu nome", "{telefone}": "5511999998888", "{data_de_hoje}": new Date().toLocaleDateString("pt-BR"),
    "{hora_agora}": new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  }
  let out = text
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v)
  return out
}

function edFileError(kind, f) {
  if (f.size === 0) return "O arquivo está vazio."
  if (f.size > ED_MAX_BYTES) return `Arquivo grande demais (${edBytes(f.size)}). O limite é ${edBytes(ED_MAX_BYTES)}.`
  const ext = edExt(f.name)
  if (ED_BLOCKED.includes(ext)) return `Arquivos .${ext} não são aceitos.`
  const rule = ED_MEDIA[kind]
  if (rule.exts && !rule.exts.includes(ext)) return `Formato não aceito. Use: ${rule.formats}.`
  if (!rule.exts && !ext) return "O arquivo precisa ter extensão (ex.: .pdf)."
  return ""
}

const edToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(",")[1] || "")
  r.onerror = () => reject(new Error("Não consegui ler o arquivo."))
  r.readAsDataURL(file)
})

/**
 * Abre a janela. opts: { item } pra editar, { text } pra começar com um texto,
 * categories: lista de categorias já usadas, onSaved: chamado depois de salvar.
 */
function openReplyEditor(opts) {
  const old = document.getElementById("vcrm-ed")
  if (old) old.remove()
  const item = opts.item || null
  const S = {
    kind: item ? item.type : opts.kind || null,
    name: item ? item.name || "" : opts.name || "",
    category: item ? item.category || "" : "",
    shortcut: item ? item.shortcut || "" : "",
    text: item ? item.text || "" : opts.text || "",
    contactName: item ? item.contactName || "" : "",
    contactPhone: item ? item.contactPhone || "" : "",
    viewOnce: item ? !!item.viewOnce : false,
    asVoiceNote: item ? !!item.asVoiceNote : false,
    more: !!(item && item.shortcut),
    file: item ? null : opts.file || null,
    fileErr: "",
    err: "",
    busy: false,
  }

  const root = document.createElement("div")
  root.id = "vcrm-ed"
  document.body.appendChild(root)
  // o WhatsApp não pode "roubar" as teclas digitadas aqui dentro
  for (const ev of ["keydown", "keyup", "keypress", "paste", "copy", "cut"]) root.addEventListener(ev, (e) => e.stopPropagation())
  root.addEventListener("mousedown", (e) => { if (e.target === root) close() })

  const close = () => { root.remove(); document.removeEventListener("keydown", onKey, true) }
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close() } }
  document.addEventListener("keydown", onKey, true)

  const read = () => {
    for (const el of root.querySelectorAll("[data-f]")) S[el.getAttribute("data-f")] = el.value
  }
  const missing = () => {
    const media = ED_MEDIA[S.kind]
    return (S.name.trim() ? 0 : 1) + (S.kind === "TEXT" ? (S.text.trim() ? 0 : 1) : 0) +
      (media && !item && !S.file ? 1 : 0) +
      (S.kind === "CONTACT" ? (S.contactName.trim() ? 0 : 1) + (S.contactPhone.trim() ? 0 : 1) : 0)
  }

  function draw() {
    const media = ED_MEDIA[S.kind]
    let html
    if (!S.kind) {
      html = `<h2>Nova resposta rápida</h2>
        <div class="ed-tiles">${ED_TYPES.map((t) => `<button type="button" data-kind="${t.id}">${icon(t.icon, 22)}<span>${t.label}</span></button>`).join("")}</div>
        <div class="ed-row"><button type="button" class="ed-ghost" data-act="close">Cancelar</button></div>`
    } else {
      const hasText = S.kind === "TEXT" || (media && media.caption)
      const miss = missing()
      html = `<h2>${ED_TITLES[S.kind][item ? 1 : 0]}</h2>
        <label>Nome <i class="req">*</i></label>
        <input data-f="name" maxlength="80" value="${esc(S.name)}" placeholder="Como você vai achar essa mensagem depois" />
        <label>Categoria <i>· só você vê (opcional)</i></label>
        <input data-f="category" list="ed-cats" maxlength="40" value="${esc(S.category)}" placeholder="Ex.: Orçamentos" />
        <datalist id="ed-cats">${(opts.categories || []).map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
        ${media ? `
          <label>${S.kind === "AUDIO" ? "Áudio" : "Arquivo"} ${item ? "" : '<i class="req">*</i>'}</label>
          ${item && !S.file && item.mediaName ? `<div class="ed-saved">${icon("paperclip", 14)} ${esc(item.mediaName)}</div>` : ""}
          <input type="file" data-file accept="${esc(media.accept)}" hidden />
          <div class="ed-drop" data-act="pick" tabindex="0">
            ${icon("download", 22)}
            <div>${item ? "Clique aqui pra trocar o arquivo." : "Clique aqui pra escolher o arquivo."}</div>
            <small>Formatos: ${esc(media.formats)} · até ${edBytes(ED_MAX_BYTES)}</small>
          </div>
          ${S.file ? `<div class="ed-saved">${icon("paperclip", 14)} <span class="ed-fn">${esc(S.file.name)}</span> <em>${edBytes(S.file.size)}</em> <button type="button" class="ed-link" data-act="rmfile">Remover</button></div>` : ""}
          ${S.fileErr ? `<p class="ed-err">${esc(S.fileErr)}</p>` : ""}
          ${S.kind === "IMAGE" || S.kind === "VIDEO" ? `<label class="ed-sw"><input type="checkbox" data-c="viewOnce" ${S.viewOnce ? "checked" : ""}/> Visualização única</label>` : ""}
          ${S.kind === "AUDIO" ? `<label class="ed-sw"><input type="checkbox" data-c="asVoiceNote" ${S.asVoiceNote ? "checked" : ""}/> Enviar como áudio gravado na hora</label><p class="ed-help">Chega como arquivo de áudio, igual a um encaminhado.</p>` : ""}
        ` : ""}
        ${hasText ? `
          <label>${S.kind === "TEXT" ? 'Mensagem <i class="req">*</i>' : "Legenda <i>(opcional)</i>"}</label>
          <textarea data-f="text" rows="${S.kind === "TEXT" ? 5 : 3}" maxlength="${S.kind === "TEXT" ? 4096 : 1024}" placeholder="Digite sua mensagem aqui…">${esc(S.text)}</textarea>
          <div class="ed-vars">${ED_VARS.map(([t, l]) => `<button type="button" data-var="${t}">${l}</button>`).join("")}</div>
          <p class="ed-help">Clique pra inserir. O cliente recebe tudo preenchido.</p>
          ${S.text.trim() ? `<div class="ed-prev"><small>Como a cliente recebe (exemplo com Maria da Silva):</small><div>${esc(edSample(S.text))}</div></div>` : ""}
        ` : ""}
        ${S.kind === "CONTACT" ? `
          <label>Nome do contato <i class="req">*</i></label>
          <input data-f="contactName" maxlength="100" value="${esc(S.contactName)}" placeholder="Ex.: Financeiro · Clínica Vivace" />
          <label>Telefone <i class="req">*</i></label>
          <input data-f="contactPhone" value="${esc(S.contactPhone)}" placeholder="+55 47 99999-0000" />
          <p class="ed-help">Chega como cartão de contato: quem recebe toca e salva ou já chama.</p>
        ` : ""}
        <button type="button" class="ed-more" data-act="more">${icon(S.more ? "chevrondown" : "chevronright", 14)} Mais opções <i>(atalho)</i></button>
        ${S.more ? `<label>Atalho</label>
          <div class="ed-sc"><b>;</b><input data-f="shortcut" maxlength="31" value="${esc(S.shortcut)}" placeholder="atalho" /></div>
          <p class="ed-help">Na conversa, digite ; e o atalho pra achar esta mensagem rápido.</p>` : ""}
        ${miss > 0 ? `<p class="ed-warn">Faltam ${miss} ${miss === 1 ? "campo" : "campos"}.</p>` : ""}
        ${S.err ? `<p class="ed-err">${esc(S.err)}</p>` : ""}
        <div class="ed-row">
          <button type="button" class="ed-ghost" data-act="close">Cancelar</button>
          ${item ? "" : '<button type="button" class="ed-ghost" data-act="type">‹ Trocar o tipo</button>'}
          <button type="button" class="ed-save" data-act="save" ${S.busy || miss > 0 ? "disabled" : ""}>${S.busy ? "Salvando..." : "Salvar"}</button>
        </div>`
    }
    // guarda onde estava o cursor pra não pular ao redesenhar
    const a = document.activeElement
    const keep = a && root.contains(a) && a.getAttribute && a.getAttribute("data-f") ? { f: a.getAttribute("data-f"), s: a.selectionStart, e: a.selectionEnd } : null
    root.innerHTML = `<div class="ed-box" role="dialog" aria-modal="true">${html}</div>`
    if (keep) {
      const el = root.querySelector(`[data-f="${keep.f}"]`)
      if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e) } catch {} }
    }
  }

  async function save() {
    read()
    if (!S.kind || missing() > 0 || S.busy) return
    S.busy = true; S.err = ""; draw()
    try {
      const media = ED_MEDIA[S.kind]
      const common = { name: S.name.trim(), category: S.category.trim() || null, shortcut: S.shortcut.trim() || null }
      const fail = (res) => { throw new Error((res && res.data && res.data.error) || "Não consegui salvar.") }
      if (media) {
        if (item) {
          const res = await api("PATCH", `/api/crm/quick-replies/${item.id}`, {
            ...common,
            ...(media.caption ? { text: S.text } : {}),
            ...(S.kind === "AUDIO" ? { asVoiceNote: S.asVoiceNote } : {}),
            ...(S.kind === "IMAGE" || S.kind === "VIDEO" ? { viewOnce: S.viewOnce } : {}),
          })
          if (!res.ok) fail(res)
          if (S.file) {
            const base64 = await edToBase64(S.file)
            const up = await new Promise((r) => chrome.runtime.sendMessage({ type: "upload", method: "PUT", path: `/api/crm/quick-replies/${item.id}/file`, fields: {}, file: { name: S.file.name, type: S.file.type, base64 } }, r))
            if (!up || !up.ok) fail(up)
          }
        } else {
          const fields = { type: S.kind, name: common.name }
          if (common.category) fields.category = common.category
          if (common.shortcut) fields.shortcut = common.shortcut
          if (media.caption && S.text) fields.text = S.text
          if (S.viewOnce) fields.viewOnce = "true"
          if (S.asVoiceNote) fields.asVoiceNote = "true"
          const base64 = await edToBase64(S.file)
          const res = await new Promise((r) => chrome.runtime.sendMessage({ type: "upload", method: "POST", path: "/api/crm/quick-replies/upload", fields, file: { name: S.file.name, type: S.file.type, base64 } }, r))
          if (!res || !res.ok) fail(res)
        }
      } else {
        const fields = S.kind === "TEXT" ? { text: S.text } : { contactName: S.contactName.trim(), contactPhone: S.contactPhone.trim() }
        const res = item
          ? await api("PATCH", `/api/crm/quick-replies/${item.id}`, { ...common, ...fields })
          : await api("POST", "/api/crm/quick-replies", { type: S.kind, ...common, ...fields })
        if (!res.ok) fail(res)
      }
      close()
      if (opts.onSaved) opts.onSaved()
    } catch (e) {
      S.busy = false
      S.err = e instanceof Error ? e.message : "Não consegui salvar."
      draw()
    }
  }

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("button, .ed-drop")
    if (!t) return
    if (t.dataset.kind) { read(); S.kind = t.dataset.kind; return draw() }
    if (t.dataset.var) {
      read()
      const ta = root.querySelector('[data-f="text"]')
      const s = ta ? ta.selectionStart ?? S.text.length : S.text.length
      const en = ta ? ta.selectionEnd ?? S.text.length : S.text.length
      S.text = S.text.slice(0, s) + t.dataset.var + S.text.slice(en)
      draw()
      const n = root.querySelector('[data-f="text"]')
      if (n) { n.focus(); const p = s + t.dataset.var.length; n.setSelectionRange(p, p) }
      return
    }
    const act = t.dataset.act
    if (act === "close") return close()
    if (act === "type") { read(); S.kind = null; S.file = null; return draw() }
    if (act === "more") { read(); S.more = !S.more; return draw() }
    if (act === "pick") { const f = root.querySelector("[data-file]"); if (f) f.click(); return }
    if (act === "rmfile") { read(); S.file = null; S.fileErr = ""; return draw() }
    if (act === "save") return save()
  })
  root.addEventListener("input", () => {
    read()
    // só redesenha o que depende do que foi digitado (aviso de campos e exemplo)
    const warn = root.querySelector(".ed-warn")
    const btn = root.querySelector(".ed-save")
    const miss = missing()
    if (btn) btn.disabled = S.busy || miss > 0
    if (warn) { warn.textContent = miss > 0 ? `Faltam ${miss} ${miss === 1 ? "campo" : "campos"}.` : ""; warn.style.display = miss > 0 ? "" : "none" }
    else if (miss > 0 && btn) { const w = document.createElement("p"); w.className = "ed-warn"; w.textContent = `Faltam ${miss} ${miss === 1 ? "campo" : "campos"}.`; btn.parentNode.before(w) }
  })
  root.addEventListener("change", (e) => {
    const c = e.target.closest("[data-c]")
    if (c) { S[c.getAttribute("data-c")] = c.checked; return }
    if (e.target.matches("[data-file]")) {
      read()
      const f = e.target.files && e.target.files[0]
      if (!f) return
      const problem = edFileError(S.kind, f)
      S.fileErr = problem
      S.file = problem ? null : f
      draw()
    }
  })

  draw()
  const first = root.querySelector('[data-f="name"]')
  if (first) first.focus()
}
