"use client"

import { useState } from "react"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minLength?: number
  autoComplete?: string
  /** "dark" é o campo das telas de entrar e cadastrar (usa a classe .auth-input). */
  variant?: "light" | "dark"
}

/** Campo de senha com botão "mostrar / ocultar" pra ver o que está digitando. */
export function PasswordInput({ value, onChange, placeholder, minLength, autoComplete, variant = "light" }: Props) {
  const [visible, setVisible] = useState(false)
  const dark = variant === "dark"

  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minLength={minLength}
        autoComplete={autoComplete}
        required
        className={dark ? "auth-input" : undefined}
        style={
          dark
            ? { paddingRight: 70 }
            : {
                width: "100%",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "10px 64px 10px 12px",
                fontSize: 14,
              }
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          color: dark ? "#ff5c8a" : "#7c3aed",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  )
}
