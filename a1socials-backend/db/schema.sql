-- A1SOCIALS custom backend schema
-- Run this once against your Postgres database (Supabase/Neon/etc.)

CREATE TABLE IF NOT EXISTS providers (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,          -- e.g. 'SEAGM', 'Yokcash', 'SMM Provider X'
  base_url      TEXT NOT NULL,
  api_key       TEXT,                           -- store encrypted in production
  api_secret    TEXT,
  status        VARCHAR(20) DEFAULT 'active',   -- active / disabled
  balance       NUMERIC(12,2) DEFAULT 0,        -- cached balance, refreshed periodically
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_services (
  id            SERIAL PRIMARY KEY,
  category      VARCHAR(30) NOT NULL,           -- 'smm' or 'game_topup'
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  provider_id   INTEGER REFERENCES providers(id),
  provider_sku  VARCHAR(100) NOT NULL,          -- provider's internal product code
  cost_price    NUMERIC(12,2) NOT NULL,         -- what you pay the provider
  sell_price    NUMERIC(12,2) NOT NULL,         -- what customer pays
  currency      VARCHAR(10) DEFAULT 'NGN',
  requires_zone_id BOOLEAN DEFAULT false,       -- true for games like Mobile Legends
  status        VARCHAR(20) DEFAULT 'active',   -- active / disabled
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  wallet_balance NUMERIC(12,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER REFERENCES customers(id),
  service_id        INTEGER REFERENCES master_services(id),
  quantity          INTEGER DEFAULT 1,
  player_id         VARCHAR(100),                -- for game top-ups
  zone_id           VARCHAR(100),                -- for games that need server/zone
  target_link       TEXT,                        -- for SMM orders (profile/post link)
  amount_charged    NUMERIC(12,2) NOT NULL,
  status            VARCHAR(20) DEFAULT 'pending', -- pending / processing / completed / failed / refunded
  provider_order_id VARCHAR(150),                -- ID returned by provider API
  failure_reason    TEXT,
  retry_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER REFERENCES customers(id),
  tx_ref            VARCHAR(150) UNIQUE NOT NULL,
  flw_transaction_id VARCHAR(150),
  amount            NUMERIC(12,2) NOT NULL,
  status            VARCHAR(20) DEFAULT 'pending', -- pending / completed / failed
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_services_category ON master_services(category);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(tx_ref);
