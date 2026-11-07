"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { QuickReplyView } from "@/lib/quick-replies"
import {
  BLOCKED_EXTS, MAX_FILE_BYTES, MEDIA_RULES, fileExt, formatBytes, type MediaKind,
} from "@/lib/quick-reply-types"

export const fileUrl = (id: string) => `/api/crm/quick-replies/${id}/file`

const ACTION_LABEL: Record<MediaKind, string> = { AUDIO: "Ouvir", IMAGE: "Ver", VIDEO: "Assistir", DOCUMENT: "Baixar" }

/** Prévia do arquivo já salvo (carrega só quando a pessoa pede). */
export function SavedPreview({ id, kind, name }: { id: string; kind: MediaKind; name: string }) {
  const src = fileUrl(id)
  if (kind === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, marginTop: 8 }} />
  }
  if (kind === "AUDIO") return <audio controls preload="none" src={src} style={{ width: "100%", marginTop: 8 }} />
  if (kind === "VIDEO") return <video controls preload="metadata" src={src} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginTop: 8 }} />
  return null
}

/** Linha do arquivo no cartão da lista: nome, tamanho, opções marcadas e botão pra ver. */
export function MediaLine({ item, kind }: { item: QuickReplyView; kind: MediaKind }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#4b5563", flexWrap: "wrap" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
          📎 {item.mediaName}
        </span>
        {item.mediaSize != null && <span style={{ color: "#9ca3af" }}>{formatBytes(item.mediaSize)}</span>}
        {item.viewOnce && <span style={flag}>visualização única</span>}
        {item.asVoiceNote && <span style={flag}>áudio gravado na hora</span>}
        {kind === "DOCUMENT" ? (
          <a href={fileUrl(item.id)} download style={linkBtn}>{ACTION_LABEL[kind]}</a>
        ) : (
          <button onClick={() => setOpen((v) => !v)} style={linkBtn}>{open ? "Fechar" : ACTION_LABEL[kind]}</button>
        )}
      </div>
      {open && <SavedPreview id={item.id} kind={kind} name={item.mediaName ?? "arquivo"} />}
    </div>
  )
}

/** Prévia do arquivo que acabou de ser escolhido (ainda não salvo). */
function LocalPreview({ kind, file }: { kind: MediaKind; file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  if (kind === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, marginTop: 8 }} />
  }
  if (kind === "AUDIO") return <audio controls src={url} style={{ width: "100%", marginTop: 8 }} />
  if (kind === "VIDEO") return <video controls src={url} style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 8, marginTop: 8 }} />
  return null
}

/** Confere o arquivo no navegador (o servidor confere de novo): devolve a mensagem de erro, ou null. */
function clientCheck(kind: MediaKind, f: File): string | null {
  if (f.size === 0) return "O arquivo está vazio."
  if (f.size > MAX_FILE_BYTES) return `Arquivo grande demais (${formatBytes(f.size)}). O limite é ${formatBytes(MAX_FILE_BYTES)}.`
  const ext = fileExt(f.name)
  if (BLOCKED_EXTS.includes(ext)) return `Arquivos .${ext} não são aceitos.`
  const rule = MEDIA_RULES[kind]
  if (rule.exts && !rule.exts.includes(ext)) return `Formato não aceito. Use: ${rule.formats}.`
  if (!rule.exts && !ext) return "O arquivo precisa ter extensão (ex.: .pdf)."
  return null
}

/** Área de escolher/arrastar o arquivo. Só entrega o arquivo se ele passar na conferência. */
export function FileDrop({
  kind, file, onFile, optional,
}: {
  kind: MediaKind
  file: File | null
  onFile: (f: File | null) => void
  optional?: boolean // ao editar: trocar o arquivo é opcional
}) {
  const input = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const rule = MEDIA_RULES[kind]

  function pick(f: File | undefined) {
    if (!f) return
    const problem = clientCheck(kind, f)
    setErr(problem)
    onFile(problem ? null : f)
  }

  const hidden = (
    <input
      ref={input}
      type="file"
      accept={rule.accept || undefined}
      style={{ display: "none" }}
      onChange={(e) => {
        pick(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  const chosen = file && (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>📎 {file.name}</span>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>{formatBytes(file.size)}</span>
        <button type="button" onClick={() => { setErr(null); onFile(null) }} style={linkBtn}>Remover</button>
      </div>
      <LocalPreview kind={kind} file={file} />
    </div>
  )

  if (kind === "AUDIO") {
    return (
      <div>
        {hidden}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button type="button" disabled title="Em breve: o Chrome grava num formato que o WhatsApp não aceita" style={{ ...tileBtn, opacity: 0.45, cursor: "not-allowed" }}>
            <span style={{ fontSize: 18 }}>🎙</span>
            <b style={{ fontSize: 13 }}>Gravar agora</b>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>em breve</span>
          </button>
          <button type="button" onClick={() => input.current?.click()} style={tileBtn}>
            <span style={{ fontSize: 18 }}>📄</span>
            <b style={{ fontSize: 13 }}>{optional ? "Trocar arquivo" : "Escolher arquivo"}</b>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>{rule.formats}</span>
          </button>
        </div>
        {chosen}
        {err && <p style={errText}>{err}</p>}
      </div>
    )
  }

  return (
    <div>
      {hidden}
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]) }}
        style={{ ...dropBox, background: over ? "#f3e8ff" : "#faf5ff", borderColor: over ? "#7c3aed" : "#c4b5fd" }}
      >
        <div style={{ fontSize: 13, color: "#6d28d9" }}>
          {optional ? "Clique aqui ou arraste um arquivo pra trocar." : "Clique aqui ou arraste o arquivo."}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
          Formatos: {rule.formats} · até {formatBytes(MAX_FILE_BYTES)}
        </div>
      </div>
      {chosen}
      {err && <p style={errText}>{err}</p>}
    </div>
  )
}

/** Botão liga/desliga. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, cursor: "pointer", fontSize: 13 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ width: 38, height: 22, borderRadius: 999, border: "none", cursor: "pointer", background: checked ? "#7c3aed" : "#d1d5db", position: "relative", padding: 0, flexShrink: 0 }}
      >
        <span style={{ position: "absolute", top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
      </button>
      {label}
    </label>
  )
}

const flag: React.CSSProperties = { background: "#ede9fe", color: "#6d28d9", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999 }
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#6d28d9", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }
const tileBtn: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "14px 8px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 12, cursor: "pointer" }
const dropBox: React.CSSProperties = { border: "1.5px dashed #c4b5fd", borderRadius: 12, padding: "22px 12px", textAlign: "center", cursor: "pointer" }
const errText: React.CSSProperties = { color: "#dc2626", fontSize: 12, margin: "8px 0 0" }
