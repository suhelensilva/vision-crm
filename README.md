# Vision CRM

CRM **separado** da agenda, que vive sobre o WhatsApp Web. Projeto próprio,
banco próprio, multiusuário. A integração com a agenda de tarot fica pra uma
fase final.

```
tarot-crm/
  extension/   extensão do Chrome (painel sobre o WhatsApp Web)
  server/      backend + login (Next.js 16, Prisma, Supabase, NextAuth)
```

## Rodar o backend (local)

1. Crie um projeto **novo** no Supabase (só pro CRM).
2. No SQL Editor do projeto novo, rode o conteúdo de
   `server/prisma/migrations/0_init/migration.sql`.
3. Copie `server/.env.example` para `server/.env` e preencha `DATABASE_URL`,
   `DIRECT_URL` e `NEXTAUTH_SECRET`.
4. Na pasta `server`:

```bash
npm run dev
```

Abre em `http://localhost:3001`. Cadastre sua conta, entre, e gere o token.

> A conexão direta do Supabase (porta 5432) não funciona em redes sem IPv6.
> Por isso as migrations são aplicadas pelo SQL Editor, não por
> `prisma migrate deploy`.

## Instalar a extensão

1. `chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação**
   → pasta `extension`.
2. Clique no ícone, cole a URL do sistema e o token, **Salvar e testar**.
3. Abra o web.whatsapp.com e clique no botão roxo ✦.

Em produção, adicione o domínio do CRM em `host_permissions` no
`extension/manifest.json`.

## Conversões pro Meta (Conversions API)

Cada compra registrada vira um evento `Purchase` no Pixel da taróloga.

- Configure em **Painel → Conversões pro Meta**: ID do Pixel e token de acesso
  (Events Manager → seu Pixel → Configurações → API de Conversões → gerar token).
  O token é guardado criptografado (AES-256-GCM, chave derivada do
  `NEXTAUTH_SECRET`; se esse segredo mudar, salve o token de novo).
- Formato: `action_source: "chat"`, com telefone/nome/ID só em SHA-256. O Meta
  liga o evento à pessoa pelo telefone. O formato `business_messaging` exige a
  API oficial do WhatsApp, que este projeto não usa.
- Evento com mais de 7 dias é recusado pelo Meta (e derruba a requisição
  inteira), então vira "Expirado" e não é reenviado.
- Falhou? O erro fica salvo na compra e dá pra usar **Reenviar pendentes**.
- `META_GRAPH_VERSION` (padrão `v27.0`) e `META_GRAPH_BASE` podem ser trocados
  por variável de ambiente.
- `test_event_code` aparece em "Testar eventos", mas o Meta ainda usa esses
  eventos na medição. Deixe vazio no dia a dia.

## Funil (kanban)

Página **Funil** do painel (`/dashboard/funil`). As colunas são as listas da
taróloga, mais "Sem lista". Arrastar um card troca de coluna.

- Card: nome, telefone, total gasto e nº de compras, próximo passo com prazo
  (atrasado / hoje / futuro) e "Parada há N dias" (3 dias ou mais).
- "Parada" conta dias desde a última movimentação (compra, mudar de lista,
  próximo passo). Abrir a conversa no WhatsApp **não** conta.
- Uma cliente pode estar em várias listas e aparece em cada coluna.
- Dá pra registrar compra e definir próximo passo direto no card, criar
  contato à mão, criar/renomear/excluir listas, buscar e filtrar.
- As rotas `/api/crm/funnel`, `/contacts` e `/lists` aceitam o token da
  extensão **ou** o login do painel (`getAuthUser`). Tudo checa o dono do dado.
- "Próximo passo" com data só (`2026-11-10`) é salvo ao meio-dia de Brasília,
  pra o dia não voltar por causa do fuso.
- Limite: lê até 2000 contatos e mostra até 100 cards por coluna.

## Cobranças

Página **Cobranças** (`/dashboard/cobrancas`): dinheiro a receber de uma cliente.

- Cria pelo botão **Cobrar** do card do funil ou por **+ Cobrança** na página:
  valor, vencimento, descrição e link de pagamento/Pix (opcionais).
- Abas Todas, A receber, Vencidas e Pagas, com o resumo no topo.
- **"Vencida" não é status do banco**: é cobrança pendente com vencimento antes
  de hoje (fuso de Brasília), calculada na leitura. Vence hoje = ainda a receber.
- **Cobrar no WhatsApp** abre a conversa com a mensagem pronta (`lib/charge-message.ts`).
  O sistema não envia nada sozinho.
- **Marcar paga** cria uma compra (`source: "cobranca"`) e dispara o evento
  Purchase pro Meta. Roda numa transação que "reserva" a cobrança
  (PENDING → PAID), então dois cliques ao mesmo tempo geram 1 compra e 1 evento.
- Só cobrança pendente muda: pagar ou cancelar de novo devolve 409.
- Não há integração de pagamento (Pix automático, Mercado Pago). Marcar como
  paga é manual.
- Telefones guardados com código do país (55) quando faltar: `lib/phone.ts`.
  O `wa.me` e o Meta exigem isso.

## Fila de entregas

1. Etiquetas/Listas (feito)
2. Disparo pro Meta (feito e testado com um Meta simulado; falta testar com
   o Pixel real)
3. Funil kanban (feito; falta o "Origem" e a aba "Resultados")
4. Cobranças (feito; falta o botão "Cobrar" no painel da extensão e a regra
   "quando pagar, mover de lista")
5. Dados do lead e Notas
6. Respostas rápidas
7. Lembretes e Adiadas
8. Painel do Dia
9. Ferramentas (wa.me, exportar, iniciar sem salvar)
10. Integração com a agenda de tarot (por último)
