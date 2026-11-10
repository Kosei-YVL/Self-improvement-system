CREATE TABLE IF NOT EXISTS focus_google_states (
 state_hash TEXT PRIMARY KEY,
 environment TEXT NOT NULL,
 origin TEXT NOT NULL,
 verifier_cipher TEXT NOT NULL,
 redirect_uri TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS focus_google_tokens (
 environment TEXT PRIMARY KEY,
 token_cipher TEXT NOT NULL,
 needs_reauth INTEGER NOT NULL DEFAULT 0,
 refresh_lock TEXT NOT NULL DEFAULT '',
 refresh_lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS focus_google_links (
 environment TEXT NOT NULL,
 calendar_id TEXT NOT NULL,
 focus_id TEXT NOT NULL,
 google_id TEXT NOT NULL,
 etag TEXT NOT NULL,
 focus_hash TEXT NOT NULL,
 PRIMARY KEY(environment,calendar_id,focus_id),
 UNIQUE(environment,calendar_id,google_id)
);
CREATE TABLE IF NOT EXISTS focus_google_connections (
 environment TEXT PRIMARY KEY,
 generation INTEGER NOT NULL DEFAULT 0
);
