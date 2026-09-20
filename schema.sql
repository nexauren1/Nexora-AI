-- Nexora AI / D1 operational schema
-- Firebase owns accounts, authentication, profile and identity data.
-- D1 stores only operational/business data.

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

INSERT INTO plans (id, name, price_usd, billing_interval, monthly_credits, active, created_at, updated_at)
VALUES
  ('free', 'Free', 0, 'month', 100, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pro', 'Pro', 5, 'month', 1000, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  price_usd = excluded.price_usd,
  billing_interval = excluded.billing_interval,
  monthly_credits = excluded.monthly_credits,
  active = excluded.active,
  updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS account_state (
  firebase_uid TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'NONE',
  monthly_credits_balance INTEGER NOT NULL DEFAULT 100,
  purchased_credits_balance INTEGER NOT NULL DEFAULT 0,
  used_this_period INTEGER NOT NULL DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  grace_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS anonymous_state (
  device_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'free',
  monthly_credits_balance INTEGER NOT NULL DEFAULT 100,
  used_this_period INTEGER NOT NULL DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT,
  device_id TEXT,
  feature TEXT NOT NULL,
  action TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  CHECK (firebase_uid IS NOT NULL OR device_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_activities_firebase_uid
ON activities (firebase_uid, created_at);

CREATE INDEX IF NOT EXISTS idx_activities_device_id
ON activities (device_id, created_at);

CREATE INDEX IF NOT EXISTS idx_activities_feature
ON activities (feature, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_request_id
ON activities (request_id)
WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT,
  device_id TEXT,
  bucket TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  source TEXT NOT NULL,
  reference_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (firebase_uid IS NOT NULL OR device_id IS NOT NULL),
  CHECK (bucket IN ('monthly', 'purchased'))
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_firebase
ON credit_ledger (firebase_uid, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_device
ON credit_ledger (device_id, created_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT,
  device_id TEXT,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  next_billing_at TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (firebase_uid IS NOT NULL OR device_id IS NOT NULL),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_provider_id
ON subscriptions (provider, provider_subscription_id)
WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_firebase
ON subscriptions (firebase_uid, status);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT,
  device_id TEXT,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_order_id TEXT,
  capture_id TEXT,
  subscription_id INTEGER,
  amount_usd INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_provider_payment
ON payments (provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_capture
ON payments (provider, capture_id)
WHERE capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_firebase
ON payments (firebase_uid, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  processed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
ON webhook_events (provider, created_at);

CREATE TABLE IF NOT EXISTS credit_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_usd INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO credit_products (id, name, credits, price_usd, active, created_at, updated_at)
VALUES
  ('credits_100', '100 Credits', 100, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('credits_300', '300 Credits', 300, 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('credits_500', '500 Credits', 500, 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('credits_1000', '1000 Credits', 1000, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  credits = excluded.credits,
  price_usd = excluded.price_usd,
  active = excluded.active,
  updated_at = excluded.updated_at;

-- Intentionally absent: conversations, messages, emails, passwords,
-- Firebase/Google tokens and user profile data.