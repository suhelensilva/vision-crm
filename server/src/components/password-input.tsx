"use client"

import { useState } from "react"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minLength?: number
  autoComplete?: string
}

/** Campo de senha com botão "mostrar / ocultar" pra ver o que está digitando. */
export function PasswordInput({ value, onChange, placeholder, minLength, autoComplete }: Props) {
  const [visible, setVisible] = useState(false)

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
        style={{
          width: "100%",
          border: "1px solid #d1d5db",
          borderRadius: 8,
          padding: "10px 64px 10px 12px",
          fontSize: 14,
        }}
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
          color: "#7c3aed",
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
