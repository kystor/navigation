// === ADD: refresh_tokens table ===
db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_id ON refresh_tokens(token_id);