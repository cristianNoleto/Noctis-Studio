// ---------------------------------------------------------------------------
// Restore dos dados a partir de um backup gerado por scripts/backup-db.mjs.
// Le os .json de uma pasta de backup e RE-INSERE as linhas no banco apontado
// por SUPABASE_DB_URL. Seguro para rodar: usa ON CONFLICT DO NOTHING, ou seja,
// NAO sobrescreve linhas que ja existem — so recupera o que estiver faltando.
//
// Uso:  node scripts/restore-db.mjs backups\2026-08-05_16-40
//   (ou)  npm run restore -- backups\2026-08-05_16-40
//
// Estrutura (tabelas/policies) NAO e recriada aqui — rode as migrations antes,
// num banco ja com o schema. Este script cuida so dos DADOS.
// ---------------------------------------------------------------------------
import pg from 'pg'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl || !dbUrl.trim()) {
  console.error('  Falta a variavel SUPABASE_DB_URL (a mesma do backup).')
  process.exit(1)
}

const arg = process.argv[2]
if (!arg) {
  console.error('  Informe a pasta do backup. Ex.:')
  console.error('    npm run restore -- backups\\2026-08-05_16-40')
  process.exit(1)
}
const folder = isAbsolute(arg) ? arg : join(process.cwd(), arg)
if (!existsSync(folder)) {
  console.error(`  Pasta nao encontrada: ${folder}`)
  process.exit(1)
}

const files = readdirSync(folder).filter((f) => f.endsWith('.json') && f !== '_manifest.json')
if (!files.length) {
  console.error('  Nenhum arquivo de tabela (.json) na pasta.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

// Insere as linhas de uma tabela via jsonb_populate_recordset: o Postgres faz a
// conversao de tipos (jsonb, arrays, timestamps) sozinho, a partir do JSON.
async function restoreTable(table, rows) {
  if (!rows.length) return { inserted: 0, skipped: 0 }
  const cols = Object.keys(rows[0])
  const colList = cols.map((c) => `"${c}"`).join(', ')
  const sql = `insert into "${table}" (${colList})
               select ${colList} from jsonb_populate_recordset(null::"${table}", $1::jsonb)
               on conflict do nothing`
  const res = await client.query(sql, [JSON.stringify(rows)])
  return { inserted: res.rowCount, skipped: rows.length - res.rowCount }
}

async function main() {
  console.log(`Restore a partir de: ${folder}`)
  await client.connect()

  // Desliga a checagem de FK durante a insercao (evita depender da ordem das
  // tabelas). Best-effort: se o papel nao puder, seguimos e tentamos 2 passadas.
  let replica = false
  try {
    await client.query("set session_replication_role = 'replica'")
    replica = true
  } catch {
    /* sem privilegio → cai no plano B (2 passadas) */
  }

  const pending = []
  let totalInserted = 0
  for (const file of files) {
    const table = file.replace(/\.json$/, '')
    const rows = JSON.parse(readFileSync(join(folder, file), 'utf8'))
    try {
      const { inserted, skipped } = await restoreTable(table, rows)
      totalInserted += inserted
      console.log(`  ${table}: +${inserted} inserida(s), ${skipped} ja existia(m)`)
    } catch (err) {
      pending.push({ table, rows })
      console.log(`  ${table}: adiado (${err.message.split('\n')[0]})`)
    }
  }

  // Plano B: 2a passada para tabelas que falharam (FK cujo pai entrou depois).
  for (let pass = 0; pass < 3 && pending.length; pass++) {
    const retry = pending.splice(0, pending.length)
    for (const { table, rows } of retry) {
      try {
        const { inserted } = await restoreTable(table, rows)
        totalInserted += inserted
        console.log(`  ${table}: +${inserted} (repasse)`)
      } catch (err) {
        pending.push({ table, rows })
        if (pass === 2) console.log(`  ${table}: FALHOU -> ${err.message.split('\n')[0]}`)
      }
    }
  }

  if (replica) await client.query("set session_replication_role = 'origin'").catch(() => {})
  await client.end()
  console.log(`\nRestore concluido: ${totalInserted} linha(s) recuperada(s).`)
  if (pending.length) console.log(`Atencao: ${pending.length} tabela(s) nao entraram (ver acima).`)
}

main().catch((err) => {
  console.error('\n  Falhou:', err.message)
  process.exit(1)
})
