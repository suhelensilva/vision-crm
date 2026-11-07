"use client"

import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch("/api/crm/token").then((r) => r.json()).then((d) => setToken(d.token ?? null)).catch(() => {})
    if (typeof window !== "undefined") setApiUrl(window.location.origin)
  }, [])

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch("/api/crm/token", { method: "POST" })
      const d = await res.json()
      setToken(d.token ?? null)
    } finally {
      setLoading(false)
    }
  }

  function copy() {
    if (!token) return
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#6d28d9", margin: 0 }}>✦ Vision CRM</h1>
        <button onClick={() => signOut({ callbackUrl: "/login" })} style={ghost}>Sair</button>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Extensão do Chrome</h2>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          Conecte a extensão ao seu CRM. Cole estes dados no popup da extensão.
        </p>

        <label style={label}>URL do sistema</label>
        <input readOnly value={apiUrl} style={input} />

        <label style={label}>Token de acesso</label>
        {token ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={token} style={{ ...input, flex: 1, fontFamily: "monospace" }} />
            <button onClick={copy} style={button}>{copied ? "Copiado!" : "Copiar"}</button>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Nenhum token gerado ainda.</p>
        )}
        <p style={{ fontSize: 12, color: "#d97706", marginTop: 6 }}>
          ⚠ Guarde em segredo. Quem tiver este token acessa seus dados.
        </p>

        <button onClick={generate} disabled={loading} style={{ ...button, marginTop: 14 }}>
          {loading ? "Gerando..." : token ? "Gerar novo token" : "Gerar token"}
        </button>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 6px 20px rgba(124,58,237,0.08)" }
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginTop: 14, marginBottom: 4 }
const input: React.CSSProperties = { width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 13 }
const button: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }
const ghost: React.CSSProperties = { background: "transparent", color: "#6b7280", border: "1px solid #d1d5db", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer" }
