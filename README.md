# Tarot CRM

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

## Fila de entregas

1. Etiquetas/Listas (feito)
2. Disparo pro Meta (CAPI): quem, quando, valor, origem
3. Funil kanban
4. Cobranças
5. Dados do lead e Notas
6. Respostas rápidas
7. Lembretes e Adiadas
8. Painel do Dia
9. Ferramentas (wa.me, exportar, iniciar sem salvar)
10. Integração com a agenda de tarot (por último)
