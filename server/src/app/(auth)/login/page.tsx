"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      setError("Email ou senha incorretos.")
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div style={wrap}>
      <form onSubmit={handleSubmit} style={card}>
        <h1 style={title}>✦ Tarot CRM</h1>
        <p style={sub}>Entre na sua conta</p>
        <label style={label}>Email</label>
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={label}>Senha</label>
        <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
        <button style={button} disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 12 }}>
          Não tem conta? <Link href="/cadastro">Cadastre-se</Link>
        </p>
      </form>
    </div>
  )
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }
const card: React.CSSProperties = { background: "#fff", padding: 28, borderRadius: 16, width: 340, boxShadow: "0 10px 30px rgba(124,58,237,0.12)", display: "flex", flexDirection: "column" }
const title: React.CSSProperties = { margin: 0, color: "#6d28d9", fontSize: 22 }
const sub: React.CSSProperties = { marginTop: 4, marginBottom: 18, color: "#6b7280", fontSize: 14 }
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginTop: 10, marginBottom: 4 }
const input: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: 14 }
const button: React.CSSProperties = { marginTop: 18, background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }
