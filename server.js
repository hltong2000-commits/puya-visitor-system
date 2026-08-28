const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createDatabase } = require('./db');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-only-change-me';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const requestWindows = new Map();

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) throw new Error('Production requires ADMIN_PASSWORD');
const db = createDatabase();
const dbReady = db.init();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

function sessionSecret() { return crypto.createHash('sha256').update(`visitor-session:${ADMIN_PASSWORD}`).digest(); }

function createSessionToken(username, role) {
  const payload = Buffer.from(JSON.stringify({ username, role, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function parseSessionToken(token) {
  try {
    const [payload, signature] = String(token).split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

function verifyPassword(password, stored) {
  if (/^[0-9a-f]{64}$/.test(stored)) {
    return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(crypto.createHash('sha256').update(password).digest('hex')));
  }
  const [algorithm, salt, digest] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const actual = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(actual));
}

const adminReady = dbReady.then(async () => { const adminExists = await db.get('SELECT username FROM admin_users WHERE username = ?', ['admin']); if (!adminExists) { await db.run('INSERT INTO admin_users(username, password_hash) VALUES (?, ?)', ['admin', hashPassword(ADMIN_PASSWORD)]); if (!process.env.ADMIN_PASSWORD) console.warn('Using development admin password; set ADMIN_PASSWORD before deployment.'); } });

function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function html(res, file) {
  const filePath = path.join(PUBLIC_DIR, file);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
  res.writeHead(200, { ...securityHeaders(), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(res);
}

function staticFile(res, pathname, baseDir = PUBLIC_DIR) {
  const safePath = path.normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(baseDir, safePath);
  if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath);
  const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
  res.writeHead(200, { ...securityHeaders(), 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())];
  }));
}

function currentSession(req) {
  const token = parseCookies(req).visitor_session;
  const session = token && parseSessionToken(token);
  return session ? { token, ...session } : null;
}

function requireAdmin(req, res) {
  const session = currentSession(req);
  if (!session) {
    json(res, 401, { error: '请先登录后台' });
    return null;
  }
  return session;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) req.destroy(new Error('payload too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

function rateLimit(req, res, key, max, windowMs) {
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const bucket = requestWindows.get(bucketKey) || { start: now, count: 0 };
  if (now - bucket.start > windowMs) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  requestWindows.set(bucketKey, bucket);
  if (bucket.count > max) { json(res, 429, { error: '请求过于频繁，请稍后再试' }); return false; }
  return true;
}

function validateVisitor(input) {
  const fields = ['name', 'mobile', 'company', 'host_name', 'visit_reason'];
  const errors = {};
  for (const field of fields) {
    if (typeof input[field] !== 'string' || !input[field].trim()) errors[field] = '此项为必填项';
    else if (input[field].trim().length > ({ name: 50, mobile: 20, company: 100, host_name: 50, visit_reason: 200 }[field])) errors[field] = '内容过长';
  }
  const mobile = typeof input.mobile === 'string' ? input.mobile.trim() : '';
  if (mobile && !/^1[3-9]\d{9}$/.test(mobile)) errors.mobile = '请输入有效的中国大陆手机号';
  const companions = Number(input.companions);
  if (!Number.isInteger(companions) || companions < 0 || companions > 50) errors.companions = '同行人数须为 0-50 的整数';
  const vehicle = typeof input.vehicle_plate === 'string' ? input.vehicle_plate.trim() : '';
  if (vehicle.length > 20) errors.vehicle_plate = '车牌号不能超过 20 个字符';
  return { errors, value: { name: input.name?.trim(), mobile, company: input.company?.trim(), host_name: input.host_name?.trim(), visit_reason: input.visit_reason?.trim(), companions, vehicle_plate: vehicle || null } };
}

function logAudit(session, action, targetId, req) {
  return db.run('INSERT INTO audit_logs(username, action, target_id, created_at, ip) VALUES (?, ?, ?, ?, ?)', [session?.username || null, action, targetId || null, new Date().toISOString(), clientIp(req)]);
}

function maskedMobile(mobile) { return mobile ? `${mobile.slice(0, 3)}****${mobile.slice(-4)}` : ''; }

function dateRange(dateFrom, dateTo) {
  const valid = /^\d{4}-\d{2}-\d{2}$/;
  if (!valid.test(dateFrom) || !valid.test(dateTo) || dateFrom > dateTo) throw new Error('日期范围无效');
  const start = new Date(`${dateFrom}T00:00:00+08:00`);
  const end = new Date(`${dateTo}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

function visitorView(row, detail = false) {
  return { id: row.id, name: row.name, mobile: detail ? row.mobile : maskedMobile(row.mobile), company: row.company, host_name: row.host_name, visit_reason: row.visit_reason, companions: row.companions, vehicle_plate: row.vehicle_plate || '', created_at: row.created_at, status: row.status, source: row.source };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function handle(req, res) {
  await adminReady;
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  if (req.method === 'GET' && pathname === '/') return html(res, 'index.html');
  if (req.method === 'GET' && pathname === '/admin') return html(res, 'admin.html');
  if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { ok: true, database: db.kind });
  if (req.method === 'GET' && pathname.startsWith('/static/')) return staticFile(res, pathname.slice('/static/'.length)) ? undefined : json(res, 404, { error: 'Not found' });
  if (req.method === 'GET' && pathname.startsWith('/assets/')) return staticFile(res, pathname.slice('/assets/'.length), path.join(PUBLIC_DIR, 'assets')) ? undefined : json(res, 404, { error: 'Not found' });
  if (req.method === 'POST' && pathname === '/api/visitors') {
    if (!rateLimit(req, res, 'visitor-submit', 30, 60_000)) return;
    try {
      const body = await readBody(req);
      const { errors, value } = validateVisitor(body);
      if (Object.keys(errors).length) return json(res, 400, { error: '请检查登记信息', fields: errors });
      const duplicateSince = new Date(Date.now() - 10 * 60_000).toISOString();
      const duplicate = await db.get("SELECT id FROM visitors WHERE mobile = ? AND created_at >= ? AND status = 'normal'", [value.mobile, duplicateSince]);
      if (duplicate && !body.confirm_duplicate) return json(res, 409, { error: '该手机号刚刚登记过，如需再次登记请确认', duplicate: true });
      const row = { id: crypto.randomUUID(), ...value, created_at: new Date().toISOString() };
      await db.run('INSERT INTO visitors(id,name,mobile,company,host_name,visit_reason,companions,vehicle_plate,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [row.id, row.name, row.mobile, row.company, row.host_name, row.visit_reason, row.companions, row.vehicle_plate, row.created_at]);
      return json(res, 201, { success: true });
    } catch (error) { return json(res, 400, { error: error.message === 'invalid json' ? '提交内容格式错误' : '提交失败，请稍后重试' }); }
  }
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    if (!rateLimit(req, res, 'admin-login', 10, 10 * 60_000)) return;
    try {
      const body = await readBody(req);
      const user = await db.get('SELECT username, password_hash, role FROM admin_users WHERE username = ?', [String(body.username || '')]);
      const valid = user && verifyPassword(String(body.password || ''), user.password_hash);
      if (!valid) return json(res, 401, { error: '账号或密码错误' });
      if (/^[0-9a-f]{64}$/.test(user.password_hash)) await db.run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [hashPassword(String(body.password || '')), user.username]);
      const token = createSessionToken(user.username, user.role);
      await logAudit({ username: user.username }, 'login', null, req);
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      return json(res, 200, { success: true }, { 'Set-Cookie': `visitor_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}` });
    } catch { return json(res, 400, { error: '登录请求格式错误' }); }
  }
  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    const session = currentSession(req);
    if (session) await logAudit(session, 'logout', null, req);
    return json(res, 200, { success: true }, { 'Set-Cookie': 'visitor_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (pathname.startsWith('/api/admin/')) {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (req.method === 'GET' && pathname === '/api/admin/me') return json(res, 200, { username: session.username, role: session.role });
    if (req.method === 'GET' && pathname === '/api/admin/visitors') {
      const from = url.searchParams.get('date_from') || new Date().toISOString().slice(0, 10);
      const to = url.searchParams.get('date_to') || from;
      const keyword = (url.searchParams.get('keyword') || '').trim();
      const status = url.searchParams.get('status') || 'normal';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
      const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
      let start; let end;
      try { [start, end] = dateRange(from, to); } catch (error) { return json(res, 400, { error: error.message }); }
      const pattern = `%${keyword}%`;
      const where = `created_at >= ? AND created_at < ? AND status = ? AND (name LIKE ? OR mobile LIKE ? OR company LIKE ? OR host_name LIKE ?)`;
      const rows = await db.all(`SELECT * FROM visitors WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [start, end, status, pattern, pattern, pattern, pattern, limit, offset]);
      const total = (await db.get(`SELECT COUNT(*) AS count FROM visitors WHERE ${where}`, [start, end, status, pattern, pattern, pattern, pattern])).count;
      await logAudit(session, 'query', null, req);
      return json(res, 200, { items: rows.map((row) => visitorView(row)), total, limit, offset });
    }
    if (req.method === 'GET' && pathname === '/api/admin/visitors/export.csv') {
      const from = url.searchParams.get('date_from') || new Date().toISOString().slice(0, 10);
      const to = url.searchParams.get('date_to') || from;
      const keyword = (url.searchParams.get('keyword') || '').trim();
      let start; let end;
      try { [start, end] = dateRange(from, to); } catch (error) { return json(res, 400, { error: error.message }); }
      const pattern = `%${keyword}%`;
      const rows = await db.all("SELECT * FROM visitors WHERE created_at >= ? AND created_at < ? AND status = 'normal' AND (name LIKE ? OR mobile LIKE ? OR company LIKE ? OR host_name LIKE ?) ORDER BY created_at DESC", [start, end, pattern, pattern, pattern, pattern]);
      const header = ['登记时间', '姓名', '手机号', '公司', '被访人', '来访事由', '同行人数', '车牌号'];
      const lines = [header, ...rows.map((row) => [row.created_at, row.name, row.mobile, row.company, row.host_name, row.visit_reason, row.companions, row.vehicle_plate || ''])].map((line) => line.map(csvCell).join(','));
      await logAudit(session, 'export', null, req);
      res.writeHead(200, { ...securityHeaders(), 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="visitors-${from}-${to}.csv"`, 'Cache-Control': 'no-store' });
      return res.end(`\uFEFF${lines.join('\r\n')}`);
    }
    const visitorMatch = pathname.match(/^\/api\/admin\/visitors\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && visitorMatch) {
      const row = await db.get('SELECT * FROM visitors WHERE id = ?', [visitorMatch[1]]);
      if (!row) return json(res, 404, { error: '记录不存在' });
      await logAudit(session, 'detail', row.id, req);
      return json(res, 200, visitorView(row, true));
    }
    if (req.method === 'PATCH' && visitorMatch) {
      if (session.role !== 'admin') return json(res, 403, { error: '无权限' });
      const body = await readBody(req);
      if (!['normal', 'hidden'].includes(body.status)) return json(res, 400, { error: '状态无效' });
      const result = await db.run('UPDATE visitors SET status = ? WHERE id = ?', [body.status, visitorMatch[1]]);
      if (!result.changes) return json(res, 404, { error: '记录不存在' });
      await logAudit(session, 'status_change', visitorMatch[1], req);
      return json(res, 200, { success: true });
    }
  }
  return json(res, 404, { error: 'Not found' });
}

const handler = (req, res) => handle(req, res).catch((error) => { console.error(error); if (!res.headersSent) json(res, 500, { error: '服务器内部错误' }); });
const server = http.createServer(handler);

if (require.main === module) server.listen(PORT, () => console.log(`Visitor system listening on http://localhost:${PORT}`));

module.exports = { server, handler, db, validateVisitor, hashPassword, verifyPassword, dateRange };
