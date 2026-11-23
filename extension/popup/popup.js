const $ = (id) => document.getElementById(id)
const views = ["loading", "on", "off"]
function view(name) { views.forEach((v) => $(v).classList.toggle("hide", v !== name)) }

function api(path) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "api", method: "GET", path }, resolve))
}

async function check() {
  const cfg = await chrome.storage.local.get(["apiUrl", "token"])
  // o endereço do sistema já vem preenchido (config.js): só falta colar o token
  $("apiUrl").value = cfg.apiUrl || VCRM_DEFAULT_URL
  if (!cfg.token) { $("msg").textContent = ""; return view("off") }

  view("loading")
  const res = await api("/api/crm/me")
  if (res && res.ok && res.data && res.data.ok) {
    const name = res.data.name || res.data.email || "Conectado"
    $("name").textContent = name
    $("email").textContent = res.data.email || ""
    $("av").textContent = name.trim().charAt(0).toUpperCase()
    return view("on")
  }
  $("offSub").textContent = res && res.status === 401
    ? "Seu token não vale mais. Gere um novo em Configurações no painel."
    : "Não conectou. Confira se o sistema está no ar."
  view("off")
}

$("save").addEventListener("click", async () => {
  let apiUrl = $("apiUrl").value.trim().replace(/\/+$/, "") || VCRM_DEFAULT_URL
  if (!/^https?:\/\//i.test(apiUrl)) apiUrl = "https://" + apiUrl // esqueceu o https://
  const token = $("token").value.trim()
  if (!token) { $("msg").textContent = "Cole o token (fica em Configurações, no site)."; return }
  await chrome.storage.local.set({ apiUrl, token })
  $("token").value = ""
  await check()
  if ($("off").classList.contains("hide")) return
  $("msg").textContent = "Não foi possível conectar. Confira a URL e o token."
})

$("open").addEventListener("click", async () => {
  const { apiUrl } = await chrome.storage.local.get("apiUrl")
  chrome.tabs.create({ url: (apiUrl || VCRM_DEFAULT_URL) + "/dashboard" })
})

$("out").addEventListener("click", async () => {
  await chrome.storage.local.remove("token")
  await check()
})

check()
