// Troca a senha de uma conta do Vision CRM direto no banco (pra quando a senha foi esquecida).
//
// Uso, na pasta server:
//   node scripts/trocar-senha.mjs email@da-conta.com
//
// A senha nova é digitada escondida (só aparecem asteriscos): não vai pra tela, nem pra arquivo,
// nem pra ninguém. Precisa do server/.env (é ele que tem o endereço do banco).
import { createRequire } from "module"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(path.join(root, "package.json"))
const bcrypt = require("bcryptjs")
const { Client } = require("pg")

function loadEnv() {
  const file = path.join(root, ".env")
  if (!fs.existsSync(file)) { console.log("Não achei o arquivo server/.env."); process.exit(1) }
  const env = {}
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (!m) continue
    let v = m[2].trim()
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}

/** Pergunta no terminal. Com `hidden`, o que é digitado vira asteriscos. */
function ask(question, hidden) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    let s = ""
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === "\u0003") { process.stdout.write("\nCancelado.\n"); process.exit(1) } // Ctrl+C
        if (c === "\r" || (c === "\n" && s)) {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.removeListener("data", onData)
          process.stdout.write("\n")
          return resolve(s)
        }
        if (c === "\n") continue
        if (c === "\b" || c === "\u007f") {
          if (s) { s = s.slice(0, -1); process.stdout.write("\b \b") }
          continue
        }
        if (c < " ") continue
        s += c
        process.stdout.write(hidden ? "*" : c)
      }
    }
    stdin.on("data", onData)
  })
}

const env = loadEnv()
let email = (process.argv[2] || "").trim()
const tty = !!process.stdin.isTTY
if (!email) {
  if (!tty) { console.log("Uso: node scripts/trocar-senha.mjs email@da-conta.com"); process.exit(1) }
  email = (await ask("E-mail da conta: ", false)).trim()
}

const db = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const found = await db.query("select name from users where email = $1", [email])
if (!found.rowCount) {
  await db.end()
  console.log(`Não achei conta com o e-mail ${email}. Confira se está igualzinho (com ponto, se tiver).`)
  process.exit(1)
}
console.log(`Conta: ${found.rows[0].name || "(sem nome)"} <${email}>`)

if (!tty) {
  await db.end()
  console.log("Abra um terminal de verdade pra rodar isto: a senha precisa ser digitada escondida.")
  process.exit(1)
}

let pass = ""
for (;;) {
  const a = await ask("Senha nova (pelo menos 6 caracteres): ", true)
  if (a.length < 6) { console.log("Muito curta. Vamos de novo."); continue }
  const b = await ask("Repita a senha nova: ", true)
  if (a !== b) { console.log("As duas não ficaram iguais. Vamos de novo."); continue }
  pass = a
  break
}

const hash = await bcrypt.hash(pass, 12) // o mesmo jeito do cadastro do site
const r = await db.query('update users set password = $1, "updatedAt" = now() where email = $2', [hash, email])
await db.end()
console.log(r.rowCount === 1 ? "\nPronto! Senha trocada. Já pode entrar no site com ela." : "\nNão consegui trocar a senha.")
process.exit(r.rowCount === 1 ? 0 : 1)
