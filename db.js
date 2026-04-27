const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'avocai.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    plan          TEXT NOT NULL DEFAULT 'free',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('user','ai','error')),
    content         TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS daily_requests (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date    TEXT NOT NULL,
    count   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_msg_conv  ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_daily_req ON daily_requests(user_id, date);
`);

// Migration : ajouter google_id sur une DB existante (sans IF NOT EXISTS)
try { db.exec('ALTER TABLE users ADD COLUMN google_id TEXT'); } catch {}

console.log('✓ Base de données initialisée (avocai.db)');

module.exports = db;
