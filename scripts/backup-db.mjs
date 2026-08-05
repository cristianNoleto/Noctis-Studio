// ---------------------------------------------------------------------------
// Backup manual do banco Supabase (Noctis Studio) — 100% Node, SEM Docker.
// Conecta direto no Postgres e exporta TODOS os dados de cada tabela do schema
// public para arquivos JSON datados em backups\AAAA-MM-DD_HH-mm\.
//
// A senha NUNCA fica no codigo: le a connection string da variavel de ambiente
// SUPABASE_DB_URL (voce configura uma vez com setx — ver instrucoes no chat).
//
// Uso:  npm run backup
// ---------------------------------------------------------------------------
import pg from 'pg'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl || !dbUrl.trim()) {
  console.error('\n  Falta a variavel SUPABASE_DB_URL.')
  console.error('  Pegue a URI em: Supabase > Project Settings > Database > Connection string.')
  console.error('  Dica: use a aba "Session pooler" (funciona melhor em rede caseira) e uma senha')
  console.error('  so com letras e numeros. Depois rode UMA vez (troque pela sua):\n')
  console.error('    setx SUPABASE_DB_URL "postgresql://postgres.xxxx:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"\n')
  console.error('  Feche e reabra o terminal e rode "npm run backup" de novo.')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
const destDir = join(__dirname, '..', 'backups', stamp)
mkdirSync(destDir, { recursive: true })

// Supabase exige SSL. rejectUnauthorized:false aceita o certificado gerenciado.
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

// Datas/BigInt viram string no JSON (para nao perder precisao nem quebrar).
function replacer(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function main() {
  console.log(`Backup iniciado -> ${destDir}`)
  await client.connect()

  // Todas as tabelas "de verdade" do schema public.
  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  )

  const manifest = { createdAt: new Date().toISOString(), tables: {} }
  let totalRows = 0

  for (const { table_name } of tables) {
    // Nome entre aspas evita problema com nomes reservados.
    const { rows } = await client.query(`select * from "${table_name}"`)
    writeFileSync(join(destDir, `${table_name}.json`), JSON.stringify(rows, replacer, 2))
    manifest.tables[table_name] = rows.length
    totalRows += rows.length
    console.log(`  ${table_name}: ${rows.length} linha(s)`)
  }

  writeFileSync(join(destDir, '_manifest.json'), JSON.stringify(manifest, replacer, 2))
  await client.end()

  console.log(`\nBackup concluido: ${tables.length} tabela(s), ${totalRows} linha(s) no total.`)
  console.log(`Pasta: ${destDir}`)
  console.log('Guarde essa pasta num lugar seguro (Google Drive, HD externo).')
}

main().catch((err) => {
  console.error('\n  Falhou:', err.message)
  if (/timeout|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH/i.test(err.message || '')) {
    console.error('  -> Parece problema de conexao. Troque a URL pela da aba "Session pooler"')
    console.error('     (Project Settings > Database) e refaca o setx. Ela funciona em rede IPv4.')
  }
  if (/password|SASL|authentication/i.test(err.message || '')) {
    console.error('  -> Senha incorreta ou com caractere especial. No Supabase, "Reset database')
    console.error('     password" e escolha uma so com letras e numeros; refaca o setx.')
  }
  process.exit(1)
})
