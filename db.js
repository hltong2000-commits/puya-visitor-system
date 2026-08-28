const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'visitors.db');

function sqliteAdapter() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  return {
    kind: 'sqlite',
    async init() {
      database.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY,name TEXT NOT NULL,mobile TEXT NOT NULL,company TEXT NOT NULL,host_name TEXT NOT NULL,visit_reason TEXT NOT NULL,companions INTEGER NOT NULL DEFAULT 0,vehicle_plate TEXT,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'normal',source TEXT NOT NULL DEFAULT 'qr_h5');
        CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at);
        CREATE INDEX IF NOT EXISTS idx_visitors_mobile ON visitors(mobile);
        CREATE INDEX IF NOT EXISTS idx_visitors_company ON visitors(company);
        CREATE INDEX IF NOT EXISTS idx_visitors_host_name ON visitors(host_name);
        CREATE TABLE IF NOT EXISTS admin_users (username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'admin');
        CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT,action TEXT NOT NULL,target_id TEXT,created_at TEXT NOT NULL,ip TEXT);
      `);
    },
    async get(sql, params = []) { return database.prepare(sql).get(...params); },
    async all(sql, params = []) { return database.prepare(sql).all(...params); },
    async run(sql, params = []) { return database.prepare(sql).run(...params); }
  };
}

function postgresAdapter() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
  const convert = (sql) => { let index = 0; return sql.replace(/\?/g, () => `$${++index}`); };
  return {
    kind: 'postgres',
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY,name TEXT NOT NULL,mobile TEXT NOT NULL,company TEXT NOT NULL,host_name TEXT NOT NULL,visit_reason TEXT NOT NULL,companions INTEGER NOT NULL DEFAULT 0,vehicle_plate TEXT,created_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'normal',source TEXT NOT NULL DEFAULT 'qr_h5');
        CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at); CREATE INDEX IF NOT EXISTS idx_visitors_mobile ON visitors(mobile); CREATE INDEX IF NOT EXISTS idx_visitors_company ON visitors(company); CREATE INDEX IF NOT EXISTS idx_visitors_host_name ON visitors(host_name);
        CREATE TABLE IF NOT EXISTS admin_users (username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'admin');
        CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY,username TEXT,action TEXT NOT NULL,target_id TEXT,created_at TIMESTAMPTZ NOT NULL,ip TEXT);`);
    },
    async get(sql, params = []) { const result = await pool.query(convert(sql) + ' LIMIT 1', params); return result.rows[0]; },
    async all(sql, params = []) { return (await pool.query(convert(sql), params)).rows; },
    async run(sql, params = []) { const result = await pool.query(convert(sql), params); return { changes: result.rowCount }; }
  };
}

function createDatabase() { return process.env.DATABASE_URL ? postgresAdapter() : sqliteAdapter(); }

module.exports = { createDatabase, DB_PATH };
