const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'visitors.db');
const REQUIRED_PG_KEYS = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];

function databaseMode(env = process.env) {
  const hasCloudBase = Boolean(env.TCB_ENV_ID || env.CLOUDBASE_APIKEY);
  if (hasCloudBase) {
    const missing = ['TCB_ENV_ID', 'CLOUDBASE_APIKEY'].filter((key) => !env[key]);
    if (missing.length) throw new Error(`CloudBase configuration missing: ${missing.join(', ')}`);
    return 'cloudbase';
  }
  if (env.DATABASE_URL || REQUIRED_PG_KEYS.some((key) => env[key]) || env.PGPORT) return 'postgres';
  if (env.NODE_ENV === 'production') throw new Error('Production requires database configuration');
  return 'sqlite';
}

function postgresSsl(mode) {
  if (!mode) return undefined;
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'verify-full') return { rejectUnauthorized: true };
  throw new Error(`PostgreSQL configuration has invalid PGSSLMODE: ${mode}`);
}

function postgresOptions(env = process.env) {
  const hasDiscreteConfig = REQUIRED_PG_KEYS.some((key) => Boolean(env[key])) || Boolean(env.PGPORT);
  let options;
  if (hasDiscreteConfig) {
    const missing = REQUIRED_PG_KEYS.filter((key) => !env[key]);
    if (missing.length) throw new Error(`PostgreSQL configuration missing: ${missing.join(', ')}`);
    const port = Number(env.PGPORT || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PostgreSQL configuration has invalid PGPORT');
    options = { host: env.PGHOST, port, database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD, max: 5 };
  } else if (env.DATABASE_URL) options = { connectionString: env.DATABASE_URL, max: 5 };
  else {
    if (env.NODE_ENV === 'production') throw new Error('Production requires PostgreSQL configuration');
    return null;
  }
  const ssl = postgresSsl(env.PGSSLMODE);
  return ssl === undefined ? options : { ...options, ssl };
}

function sqliteAdapter() {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  const run = (sql, params = []) => database.prepare(sql).run(...params);
  return {
    kind: 'sqlite',
    async init() { database.exec(`PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY,name TEXT NOT NULL,mobile TEXT NOT NULL,company TEXT NOT NULL,host_name TEXT NOT NULL,visit_reason TEXT NOT NULL,companions INTEGER NOT NULL DEFAULT 0,vehicle_plate TEXT,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'normal',source TEXT NOT NULL DEFAULT 'qr_h5'); CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at); CREATE INDEX IF NOT EXISTS idx_visitors_mobile ON visitors(mobile); CREATE INDEX IF NOT EXISTS idx_visitors_company ON visitors(company); CREATE INDEX IF NOT EXISTS idx_visitors_host_name ON visitors(host_name); CREATE TABLE IF NOT EXISTS admin_users (username TEXT PRIMARY KEY,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'admin'); CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT,action TEXT NOT NULL,target_id TEXT,created_at TEXT NOT NULL,ip TEXT);`); },
    async findAdmin(username) { return database.prepare('SELECT username, password_hash, role FROM admin_users WHERE username = ?').get(username); },
    async createAdmin(username, passwordHash) { return run('INSERT INTO admin_users(username, password_hash) VALUES (?, ?)', [username, passwordHash]); },
    async updateAdminPassword(username, passwordHash) { return run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [passwordHash, username]); },
    async findRecentVisitor(mobile, since) { return database.prepare("SELECT id FROM visitors WHERE mobile = ? AND created_at >= ? AND status = 'normal'").get(mobile, since); },
    async createVisitor(row) { return run('INSERT INTO visitors(id,name,mobile,company,host_name,visit_reason,companions,vehicle_plate,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [row.id, row.name, row.mobile, row.company, row.host_name, row.visit_reason, row.companions, row.vehicle_plate, row.created_at]); },
    async listVisitors({ start, end, status, keyword, limit, offset }) { const p = `%${keyword}%`; const where = `created_at >= ? AND created_at < ? AND status = ? AND (name LIKE ? OR mobile LIKE ? OR company LIKE ? OR host_name LIKE ?)`; const params = [start, end, status, p, p, p, p]; return { items: database.prepare(`SELECT * FROM visitors WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset), total: database.prepare(`SELECT COUNT(*) AS count FROM visitors WHERE ${where}`).get(...params).count }; },
    async exportVisitors({ start, end, keyword }) { const p = `%${keyword}%`; return database.prepare("SELECT * FROM visitors WHERE created_at >= ? AND created_at < ? AND status = 'normal' AND (name LIKE ? OR mobile LIKE ? OR company LIKE ? OR host_name LIKE ?) ORDER BY created_at DESC").all(start, end, p, p, p, p); },
    async findVisitorById(id) { return database.prepare('SELECT * FROM visitors WHERE id = ?').get(id); },
    async updateVisitorStatus(id, status) { return run('UPDATE visitors SET status = ? WHERE id = ?', [status, id]).changes; },
    async createAuditLog({ username, action, targetId, createdAt, ip }) { return run('INSERT INTO audit_logs(username, action, target_id, created_at, ip) VALUES (?, ?, ?, ?, ?)', [username, action, targetId, createdAt, ip]); }
  };
}

function postgresAdapter(options) {
  const { Pool } = require('pg');
  const pool = new Pool(options);
  const convert = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
  const query = (sql, params = []) => pool.query(convert(sql), params);
  return {
    kind: 'postgres',
    async init() { await pool.query('SELECT 1'); },
    async findAdmin(username) { return (await query('SELECT username, password_hash, role FROM admin_users WHERE username = ? LIMIT 1', [username])).rows[0]; },
    async createAdmin(username, passwordHash) { return query('INSERT INTO admin_users(username, password_hash) VALUES (?, ?)', [username, passwordHash]); },
    async updateAdminPassword(username, passwordHash) { return query('UPDATE admin_users SET password_hash = ? WHERE username = ?', [passwordHash, username]); },
    async findRecentVisitor(mobile, since) { return (await query("SELECT id FROM visitors WHERE mobile = ? AND created_at >= ? AND status = 'normal' LIMIT 1", [mobile, since])).rows[0]; },
    async createVisitor(row) { return query('INSERT INTO visitors(id,name,mobile,company,host_name,visit_reason,companions,vehicle_plate,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [row.id, row.name, row.mobile, row.company, row.host_name, row.visit_reason, row.companions, row.vehicle_plate, row.created_at]); },
    async listVisitors({ start, end, status, keyword, limit, offset }) { const p = `%${keyword}%`; const where = `created_at >= ? AND created_at < ? AND status = ? AND (name LIKE ? OR mobile LIKE ? OR company LIKE ? OR host_name LIKE ?)`; const params = [start, end, status, p, p, p, p]; const [rows, count] = await Promise.all([query(`SELECT * FROM visitors WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]), query(`SELECT COUNT(*) AS count FROM visitors WHERE ${where}`, params)]); return { items: rows.rows, total: Number(count.rows[0].count) }; },
    async exportVisitors({ start, end, keyword }) { const p = `%${keyword}%`; return (await query("SELECT * FROM visitors WHERE created_at >= ? AND created_at < ? AND status = 'normal' AND (name LIKE ? OR mobile LIKE ? OR company LIKE ? OR host_name LIKE ?) ORDER BY created_at DESC", [start, end, p, p, p, p])).rows; },
    async findVisitorById(id) { return (await query('SELECT * FROM visitors WHERE id = ? LIMIT 1', [id])).rows[0]; },
    async updateVisitorStatus(id, status) { return (await query('UPDATE visitors SET status = ? WHERE id = ?', [status, id])).rowCount; },
    async createAuditLog({ username, action, targetId, createdAt, ip }) { return query('INSERT INTO audit_logs(username, action, target_id, created_at, ip) VALUES (?, ?, ?, ?, ?)', [username, action, targetId, createdAt, ip]); }
  };
}

function cloudbaseAdapter(env, injectedApp) {
  const cloudbase = injectedApp ? null : require('@cloudbase/node-sdk');
  const app = injectedApp || cloudbase.init({ env: env.TCB_ENV_ID, accessKey: env.CLOUDBASE_APIKEY });
  const database = app.rdb({ instance: env.TCB_DB_INSTANCE || 'default', database: env.TCB_DB_SCHEMA || 'public' });
  const unwrap = (result) => { if (result?.error) throw new Error(result.error.message || String(result.error)); return result || {}; };
  const table = (name) => database.from(name);
  const escapeFilter = (value) => String(value).replace(/[(),%_]/g, (c) => `\\${c}`);
  return {
    kind: 'cloudbase-postgres',
    async init() { unwrap(await table('admin_users').select('username').limit(1)); },
    async findAdmin(username) { const r = unwrap(await table('admin_users').select('username,password_hash,role').eq('username', username).maybeSingle()); return r.data; },
    async createAdmin(username, passwordHash) { return unwrap(await table('admin_users').insert({ username, password_hash: passwordHash, role: 'admin' })); },
    async updateAdminPassword(username, passwordHash) { return unwrap(await table('admin_users').update({ password_hash: passwordHash }).eq('username', username)); },
    async findRecentVisitor(mobile, since) { const r = unwrap(await table('visitors').select('id').eq('mobile', mobile).gte('created_at', since).eq('status', 'normal').limit(1)); return r.data?.[0]; },
    async createVisitor(row) { return unwrap(await table('visitors').insert({ ...row, status: 'normal', source: 'qr_h5' })); },
    async listVisitors({ start, end, status, keyword, limit, offset }) { const p = escapeFilter(keyword); const q = table('visitors').select('*', { count: 'exact' }).gte('created_at', start).lt('created_at', end).eq('status', status).or(`name.like.%${p}%,mobile.like.%${p}%,company.like.%${p}%,host_name.like.%${p}%`).order('created_at', { ascending: false }).range(offset, offset + limit - 1); const r = unwrap(await q); return { items: r.data || [], total: Number(r.count || 0) }; },
    async exportVisitors({ start, end, keyword }) { const p = escapeFilter(keyword); const r = unwrap(await table('visitors').select('*').gte('created_at', start).lt('created_at', end).eq('status', 'normal').or(`name.like.%${p}%,mobile.like.%${p}%,company.like.%${p}%,host_name.like.%${p}%`).order('created_at', { ascending: false })); return r.data || []; },
    async findVisitorById(id) { const r = unwrap(await table('visitors').select('*').eq('id', id).maybeSingle()); return r.data; },
    async updateVisitorStatus(id, status) { const r = unwrap(await table('visitors').update({ status }).eq('id', id).select('id')); return (r.data || []).length; },
    async createAuditLog({ username, action, targetId, createdAt, ip }) { return unwrap(await table('audit_logs').insert({ username, action, target_id: targetId, created_at: createdAt, ip })); }
  };
}

function createDatabase({ env = process.env, cloudbaseApp } = {}) {
  const mode = databaseMode(env);
  if (mode === 'cloudbase') return cloudbaseAdapter(env, cloudbaseApp);
  if (mode === 'postgres') return postgresAdapter(postgresOptions(env));
  return sqliteAdapter();
}

module.exports = { createDatabase, databaseMode, DB_PATH, postgresOptions };
