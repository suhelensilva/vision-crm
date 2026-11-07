"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const LINKS = [
  { href: "/dashboard/funil", label: "Funil" },
  { href: "/dashboard/configuracoes", label: "Configurações" },
]

export function DashNav() {
  const pathname = usePathname()

  return (
    <header style={bar}>
      <span style={logo}>✦ Vision CRM</span>
      <nav style={{ display: "flex", gap: 4, flex: 1 }}>
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                color: active ? "#6d28d9" : "#6b7280",
                background: active ? "#f3e8ff" : "transparent",
              }}
            >
              {l.label}
            </Link>
          )
        })}
      </nav>
      <button onClick={() => signOut({ callbackUrl: "/login" })} style={exit}>Sair</button>
    </header>
  )
}

const bar: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 20, padding: "10px 20px",
  background: "#fff", borderBottom: "1px solid #ede9fe",
}
const logo: React.CSSProperties = { color: "#6d28d9", fontWeight: 800, fontSize: 18 }
const exit: React.CSSProperties = {
  background: "transparent", color: "#6b7280", border: "1px solid #d1d5db",
  borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer",
}
