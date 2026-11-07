// Service worker da extensão.
// Faz TODAS as chamadas à API do sistema de agendamento.
// Rodar aqui (e não no content script) resolve dois problemas:
//   1. A CSP do WhatsApp Web bloquearia fetch pra outro domínio.
//   2. Com host_permissions, o service worker tem acesso cross-origin sem CORS.

async function getConfig() {
  const { apiUrl, token } = await chrome.storage.local.get(["apiUrl", "token"])
  return {
    apiUrl: (apiUrl || "").replace(/\/+$/, ""),
    token: token || "",
  }
}

async function apiFetch(method, path, body) {
  const { apiUrl, token } = await getConfig()
  if (!apiUrl || !token) {
    return { ok: false, status: 0, error: "not_configured" }
  }
  try {
    const res = await fetch(apiUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, error: String(e) }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "api") {
    apiFetch(msg.method, msg.path, msg.body).then(sendResponse)
    return true // resposta assíncrona
  }
})
