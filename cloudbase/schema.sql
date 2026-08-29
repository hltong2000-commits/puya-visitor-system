CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  company TEXT NOT NULL,
  host_name TEXT NOT NULL,
  visit_reason TEXT NOT NULL,
  companions INTEGER NOT NULL DEFAULT 0,
  vehicle_plate TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'normal',
  source TEXT NOT NULL DEFAULT 'qr_h5'
);
CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at);
CREATE INDEX IF NOT EXISTS idx_visitors_mobile ON visitors(mobile);
CREATE INDEX IF NOT EXISTS idx_visitors_company ON visitors(company);
CREATE INDEX IF NOT EXISTS idx_visitors_host_name ON visitors(host_name);

CREATE TABLE IF NOT EXISTS admin_users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  username TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  ip TEXT
);
