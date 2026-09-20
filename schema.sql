
-- Nexora AI / D1
-- Phase 1: anonymous device mode.
-- Firebase authentication and subscriptions are intentionally
-- not included yet. They will be added in a later phase.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_usd INTEGER NOT NULL DEFAULT 0,
  billing_interval TEXT NOT NULL DEFAULT 'month',
  monthly_credits INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO plans (
  id, name, price_usd, billing_interval,
  monthly_credits, active, created_at, updated_at
)
VALUES (
  'free',
  'Free',
  0,
  'month',
  100,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  price_usd = excluded.price_usd,
  billing_interval = excluded.billing_interval,
  monthly_credits = excluded.monthly_credits,
  active = excluded.active,
  updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS anonymous_state (
  device_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'free',
  monthly_credits_balance INTEGER NOT NULL DEFAULT 100,
  used_this_period INTEGER NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_device
ON conversations(device_id, updated_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN ('user', 'assistant')
  ),
  content TEXT NOT NULL,
  file_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id)
    REFERENCES conversations(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  action TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_request
ON activities(request_id)
WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_device
ON activities(device_id, created_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (
    bucket = 'monthly'
  ),
  entry_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  source TEXT NOT NULL,
  reference_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_device
ON credit_ledger(device_id, created_at);

-- Future phase:
-- account_state
-- Firebase UID mapping
-- subscriptions
-- payments
-- webhook_events
-- purchased credits
