// Banco local do Creator (SQLite embutido no Electron — node:sqlite, sem dependência nativa).
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const MIGRACOES = [
  `CREATE TABLE IF NOT EXISTS accounts (
     id TEXT PRIMARY KEY,               -- e-mail da conta Google
     provider TEXT NOT NULL DEFAULT 'flow',
     label TEXT,
     plan TEXT DEFAULT 'free',          -- free | pro | ultra (lido da tela do Flow quando possível)
     credits INTEGER,
     status TEXT NOT NULL DEFAULT 'active', -- active | cooldown | reconnect | disabled | quota
     allowed_types TEXT NOT NULL DEFAULT '["image","video"]',
     is_default INTEGER NOT NULL DEFAULT 0,
     enabled INTEGER NOT NULL DEFAULT 1,
     cooldown_until INTEGER,
     cooldown_count INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     profile_dir TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0,
     last_used INTEGER,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS projects (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     folder TEXT NOT NULL,
     account_id TEXT,
     priority INTEGER NOT NULL DEFAULT 0,  -- -1 baixa · 0 normal · 1 alta
     paused INTEGER NOT NULL DEFAULT 0,
     settings TEXT NOT NULL DEFAULT '{}',
     next_seq INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS jobs (
     id TEXT PRIMARY KEY,
     project_id INTEGER NOT NULL,
     seq TEXT NOT NULL,
     kind TEXT NOT NULL,                 -- image | video | upscale | upload
     status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | downloading | done | failed | deleted
     prompt TEXT NOT NULL DEFAULT '',
     original_prompt TEXT NOT NULL DEFAULT '',
     params TEXT NOT NULL DEFAULT '{}',
     account_id TEXT,
     pinned_account TEXT,                -- após cooldown/cota a fila espera ESTA conta (não troca de conta para fugir do limite)
     parent_id TEXT,
     attempts INTEGER NOT NULL DEFAULT 0,
     rewrites TEXT NOT NULL DEFAULT '[]',
     error TEXT,
     error_cat TEXT,
     files TEXT NOT NULL DEFAULT '[]',
     favorite INTEGER NOT NULL DEFAULT 0,
     not_before INTEGER,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     started_at INTEGER,
     finished_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
  `CREATE TABLE IF NOT EXISTS usage (
     account_id TEXT NOT NULL,
     day TEXT NOT NULL,
     kind TEXT NOT NULL,
     model TEXT NOT NULL DEFAULT '',
     count INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (account_id, day, kind, model)
   )`,
  `CREATE TABLE IF NOT EXISTS packs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS pack_items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     pack_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     file_path TEXT NOT NULL,
     body_path TEXT,
     is_character INTEGER NOT NULL DEFAULT 0,
     voice TEXT,
     notes TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS project_packs (
     project_id INTEGER NOT NULL,
     pack_id INTEGER NOT NULL,
     PRIMARY KEY (project_id, pack_id)
   )`,
];

function abrir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  for (const sql of MIGRACOES) db.exec(sql);
  return db;
}

// Atalhos: JSON nas colunas de texto.
const J = (v, padrao) => { try { return v == null ? padrao : JSON.parse(v); } catch { return padrao; } };

module.exports = { abrir, J };
