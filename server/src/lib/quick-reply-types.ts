/** Tipos de resposta rápida. Sem imports de servidor: a tela também usa este arquivo. */
export const QUICK_REPLY_TYPES = ["TEXT", "AUDIO", "IMAGE", "VIDEO", "DOCUMENT", "CONTACT", "SEQUENCE"] as const
export type QuickReplyKind = (typeof QUICK_REPLY_TYPES)[number]

export const TYPE_INFO: Record<QuickReplyKind, { label: string; hint: string; icon: string; available: boolean }> = {
  TEXT: { label: "Texto", hint: "Uma mensagem de texto pronta", icon: "≡", available: true },
  AUDIO: { label: "Áudio", hint: "Falta decidir onde guardar os arquivos", icon: "🎙", available: false },
  IMAGE: { label: "Imagem", hint: "Falta decidir onde guardar os arquivos", icon: "🖼", available: false },
  VIDEO: { label: "Vídeo", hint: "Falta decidir onde guardar os arquivos", icon: "🎞", available: false },
  DOCUMENT: { label: "Documento", hint: "Falta decidir onde guardar os arquivos", icon: "📄", available: false },
  CONTACT: { label: "Contato", hint: "Cartão de contato: quem recebe toca e salva", icon: "👤", available: true },
  SEQUENCE: { label: "Sequência", hint: "Falta ver como é o formulário", icon: "☰", available: false },
}
