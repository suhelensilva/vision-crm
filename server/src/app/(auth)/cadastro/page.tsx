"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PasswordInput } from "@/components/password-input"

export default function CadastroPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("As senhas não são iguais.")
      return
    }

    setLoading(true)
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || "Erro ao cadastrar.")
      setLoading(false)
      return
    }
    await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div style={wrap}>
      <form onSubmit={handleSubmit} style={card}>
        <h1 style={title}>✦ Vision CRM</h1>
        <p style={sub}>Crie sua conta</p>
        <label style={label}>Nome</label>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} required />
        <label style={label}>Email</label>
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={label}>Senha (mínimo 6 caracteres)</label>
        <PasswordInput value={password} onChange={setPassword} minLength={6} autoComplete="new-password" />
        <label style={label}>Confirmar senha</label>
        <PasswordInput value={confirm} onChange={setConfirm} minLength={6} autoComplete="new-password" />
        {mismatch && <p style={{ color: "#dc2626", fontSize: 12, margin: "6px 0 0" }}>As senhas não são iguais.</p>}
        {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
        <button style={button} disabled={loading || mismatch}>{loading ? "Criando..." : "Criar conta"}</button>
        <p style={{ fontSize: 13, textAlign: "center", marginTop: 12 }}>
          Já tem conta? <Link href="/login">Entrar</Link>
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
