# Tarot CRM — extensão do Chrome

CRM que vive **sobre o WhatsApp Web**. Ao abrir uma conversa, mostra um painel
lateral com o histórico de compras daquela cliente, a recorrência dela e um
botão pra registrar uma nova compra. Tudo salvo no mesmo banco do seu sistema
de agendamento (`tarot-agenda`).

## Como funciona (resumo)

- **`content.js`** injeta o painel no WhatsApp Web e detecta a conversa aberta
  (nome e telefone).
- **`background.js`** (service worker) faz as chamadas à API do sistema. Roda
  aqui porque o WhatsApp bloqueia chamadas externas na página, e o service
  worker tem acesso cross-origin via `host_permissions`.
- **API** (no projeto `tarot-agenda`): rotas em `/api/crm/*`, autenticadas por
  um token que você gera no painel (Configurações › Extensão CRM).

## Primeiro passo: preparar o sistema (uma vez só)

No projeto `tarot-agenda`, aplicar a mudança do banco (modelo `Purchase` + token):

```bash
npx prisma migrate dev --name add_crm_purchases
```

Isso também roda o `prisma generate`. Depois é só subir o sistema:

```bash
npm run dev
```

## Segundo passo: gerar o token

1. Entre no painel do sistema › **Configurações**.
2. No cartão **Extensão CRM (WhatsApp Web)**, clique em **Gerar token** e copie.
3. Copie também a **URL do sistema** mostrada ali (ex.: `http://localhost:3000`).

## Terceiro passo: instalar a extensão

1. Chrome › `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** e selecione esta pasta (`tarot-crm`).
4. Clique no ícone da extensão, cole a **URL** e o **token**, e
   **Salvar e testar conexão**. Deve aparecer "Conectado como…".

## Usar

Abra o `web.whatsapp.com`, entre numa conversa individual e clique no botão
roxo **✦** (canto inferior direito) pra abrir o painel.

## Observações

- **Domínio de produção:** se o sistema for publicado num domínio próprio
  (não `*.vercel.app` nem `localhost`), adicione esse endereço em
  `host_permissions` no `manifest.json`.
- **Grupos** são ignorados (só conversas individuais têm telefone de cliente).
- **Seletores do WhatsApp:** se o painel parar de detectar nome/telefone depois
  de uma atualização do WhatsApp, o ajuste fica nas funções `getActivePhone()`
  e `getActiveName()` em `content.js`.

## Próximas fases (ainda não feitas)

- **Conversões pro Meta (CAPI):** o modelo `Purchase` já nasce com os campos
  `ctwaClid`, `metaEventSent` e `metaEventId` reservados pra isso.
- **Automação de lembretes** via Evolution API (já existe no `tarot-agenda`).
- Ícones próprios da extensão e publicação na Chrome Web Store.
