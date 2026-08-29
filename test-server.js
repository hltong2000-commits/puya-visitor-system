process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'test-password';
for (const key of ['DATABASE_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'TCB_ENV_ID', 'CLOUDBASE_APIKEY']) {
  delete process.env[key];
}
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase, databaseMode, postgresOptions } = require('./db');
const { server, db, validateVisitor, hashPassword, verifyPassword, dateRange } = require('./server');

test('postgresOptions builds a bounded CloudBase pool configuration', () => {
  assert.deepEqual(postgresOptions({
    PGHOST: 'db.example.internal',
    PGPORT: '5432',
    PGDATABASE: 'visitor',
    PGUSER: 'visitor_app',
    PGPASSWORD: 'secret',
    PGSSLMODE: 'require',
    NODE_ENV: 'production'
  }), {
    host: 'db.example.internal',
    port: 5432,
    database: 'visitor',
    user: 'visitor_app',
    password: 'secret',
    max: 5,
    ssl: { rejectUnauthorized: false }
  });
});

test('postgresOptions prefers complete CloudBase configuration over DATABASE_URL', () => {
  assert.deepEqual(postgresOptions({
    DATABASE_URL: 'postgresql://legacy:pass@example.test/legacy',
    PGHOST: 'db.example.internal',
    PGPORT: '5432',
    PGDATABASE: 'visitor',
    PGUSER: 'visitor_app',
    PGPASSWORD: 'secret',
    NODE_ENV: 'production'
  }), {
    host: 'db.example.internal',
    port: 5432,
    database: 'visitor',
    user: 'visitor_app',
    password: 'secret',
    max: 5
  });
});

test('postgresOptions keeps DATABASE_URL as a bounded compatibility path', () => {
  assert.deepEqual(postgresOptions({
    DATABASE_URL: 'postgresql://user:pass@example.test/visitor',
    NODE_ENV: 'production'
  }), {
    connectionString: 'postgresql://user:pass@example.test/visitor',
    max: 5
  });
});

test('postgresOptions only falls back to SQLite outside production', () => {
  assert.equal(postgresOptions({ NODE_ENV: 'development' }), null);
  assert.throws(() => postgresOptions({ NODE_ENV: 'production' }), /Production requires PostgreSQL/);
  assert.throws(() => postgresOptions({ PGHOST: 'db.example.internal' }), /PGDATABASE/);
  assert.throws(() => postgresOptions({
    DATABASE_URL: 'postgresql://legacy:pass@example.test/legacy',
    PGPORT: '5432'
  }), /PGHOST/);
});

test('postgresOptions maps supported PGSSLMODE values and rejects unknown values', () => {
  const env = {
    PGHOST: 'db.example.internal',
    PGDATABASE: 'visitor',
    PGUSER: 'visitor_app',
    PGPASSWORD: 'secret'
  };

  assert.equal(postgresOptions({ ...env, PGSSLMODE: 'disable' }).ssl, false);
  assert.deepEqual(postgresOptions({ ...env, PGSSLMODE: 'require' }).ssl, { rejectUnauthorized: false });
  assert.deepEqual(postgresOptions({ ...env, PGSSLMODE: 'verify-full' }).ssl, { rejectUnauthorized: true });
  assert.throws(() => postgresOptions({ ...env, PGSSLMODE: 'requrie' }), /PGSSLMODE/);
});

test('databaseMode selects CloudBase only with complete credentials', () => {
  assert.equal(databaseMode({ NODE_ENV: 'development' }), 'sqlite');
  assert.equal(databaseMode({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example' }), 'postgres');
  assert.equal(databaseMode({ NODE_ENV: 'production', TCB_ENV_ID: 'env', CLOUDBASE_APIKEY: 'key' }), 'cloudbase');
  assert.throws(() => databaseMode({ NODE_ENV: 'production', TCB_ENV_ID: 'env' }), /CLOUDBASE_APIKEY/);
  assert.throws(() => databaseMode({ NODE_ENV: 'production' }), /database configuration/);
});

function fakeCloudBase(resultFactory) {
  const calls = [];
  const app = { rdb: () => ({ from(table) {
    const state = { table };
    const builder = new Proxy({}, {
      get(_target, method) {
        if (method === 'then') return (resolve, reject) => Promise.resolve(resultFactory(state, calls)).then(resolve, reject);
        return (...args) => { calls.push([table, String(method), ...args]); state.method = String(method); state.args = args; return builder; };
      }
    });
    return builder;
  } }) };
  return { app, calls };
}

test('CloudBase adapter uses structured rdb operations', async () => {
  const fake = fakeCloudBase((state) => state.table === 'visitors' && state.method === 'range'
    ? { data: [{ id: 'v1' }], count: 1 }
    : { data: [{ id: 'v1' }] });
  const database = createDatabase({ env: { NODE_ENV: 'production', TCB_ENV_ID: 'env', CLOUDBASE_APIKEY: 'key' }, cloudbaseApp: fake.app });
  const row = { id: 'v1', name: '张三', mobile: '13812345678', company: '示例', host_name: '李工', visit_reason: '交流', companions: 0, vehicle_plate: null, created_at: '2026-08-28T00:00:00.000Z' };
  await database.createVisitor(row);
  const list = await database.listVisitors({ start: '2026-08-27T16:00:00.000Z', end: '2026-08-28T16:00:00.000Z', status: 'normal', keyword: '示例%公司', limit: 20, offset: 0 });
  assert.equal(database.kind, 'cloudbase-postgres');
  assert.deepEqual(list, { items: [{ id: 'v1' }], total: 1 });
  assert.ok(fake.calls.some(([table, method, value]) => table === 'visitors' && method === 'insert' && value.status === 'normal'));
  assert.ok(fake.calls.some(([, method]) => method === 'gte'));
  assert.ok(fake.calls.some(([, method]) => method === 'lt'));
  assert.ok(fake.calls.some(([, method]) => method === 'or'));
  assert.ok(fake.calls.some(([, method, start, end]) => method === 'range' && start === 0 && end === 19));
});

test('CloudBase adapter propagates rdb errors', async () => {
  const fake = fakeCloudBase(() => ({ error: { message: 'rdb unavailable' } }));
  const database = createDatabase({ env: { NODE_ENV: 'production', TCB_ENV_ID: 'env', CLOUDBASE_APIKEY: 'key' }, cloudbaseApp: fake.app });
  await assert.rejects(() => database.findVisitorById('v1'), /rdb unavailable/);
});

test('validateVisitor accepts the minimal mobile registration payload', () => {
  const result = validateVisitor({ name: '张三', mobile: '13812345678', company: '示例公司', host_name: '李工', visit_reason: '项目交流', companions: 1, vehicle_plate: '' });
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.companions, 1);
  assert.equal(result.value.vehicle_plate, null);
});

test('validateVisitor rejects missing fields and invalid values', () => {
  const result = validateVisitor({ name: '', mobile: '123', company: 'A', host_name: '', visit_reason: '', companions: 51, vehicle_plate: '' });
  assert.equal(result.errors.name, '此项为必填项');
  assert.equal(result.errors.mobile, '请输入有效的中国大陆手机号');
  assert.equal(result.errors.host_name, '此项为必填项');
  assert.equal(result.errors.visit_reason, '此项为必填项');
  assert.equal(result.errors.companions, '同行人数须为 0-50 的整数');
});

test('password hashing uses scrypt and verifies the password', () => {
  const stored = hashPassword('correct horse');
  assert.match(stored, /^scrypt\$/);
  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
});

test('dateRange converts Shanghai calendar days to UTC boundaries', () => {
  assert.deepEqual(dateRange('2026-08-28', '2026-08-28'), ['2026-08-27T16:00:00.000Z', '2026-08-28T16:00:00.000Z']);
});

test('visitor registration and admin query work end to end', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const pathname of ['/', '/admin', '/styles.css', '/app.js', '/admin.js', '/static/styles.css', '/static/app.js', '/static/admin.js']) {
    const response = await fetch(`${base}${pathname}`);
    assert.equal(response.status, 200, pathname);
  }

  const registrationHtml = await (await fetch(`${base}/`)).text();
  assert.match(registrationHtml, /id="registration-success"/);
  assert.match(registrationHtml, /data-receipt="mobile"/);

  const payload = { name: '张三', mobile: '13812345678', company: '示例公司', host_name: '李工', visit_reason: '项目交流', companions: 1, vehicle_plate: '' };
  const created = await fetch(`${base}/api/visitors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.success, true);
  assert.deepEqual(
    {
      name: createdBody.visitor.name,
      mobile: createdBody.visitor.mobile,
      company: createdBody.visitor.company,
      host_name: createdBody.visitor.host_name,
      visit_reason: createdBody.visitor.visit_reason,
      companions: createdBody.visitor.companions,
      vehicle_plate: createdBody.visitor.vehicle_plate
    },
    { ...payload, vehicle_plate: '' }
  );
  assert.match(createdBody.visitor.created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(createdBody.visitor).sort(), [
    'companions',
    'company',
    'created_at',
    'host_name',
    'mobile',
    'name',
    'vehicle_plate',
    'visit_reason'
  ]);

  const invalid = await fetch(`${base}/api/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, mobile: '123' })
  });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.fields.mobile, '请输入有效的中国大陆手机号');
  assert.equal('visitor' in invalidBody, false);

  const originalCreateVisitor = db.createVisitor;
  db.createVisitor = async () => { throw new Error('forced database failure'); };
  try {
    const failed = await fetch(`${base}/api/visitors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, mobile: '13912345678' })
    });
    assert.equal(failed.status, 500);
    const failedBody = await failed.json();
    assert.equal(failedBody.error, '提交失败，请稍后重试');
    assert.equal('visitor' in failedBody, false);
  } finally {
    db.createVisitor = originalCreateVisitor;
  }
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-password' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const list = await fetch(`${base}/api/admin/visitors?date_from=${today}&date_to=${today}`, { headers: { Cookie: cookie } });
  assert.equal(list.status, 200);
  const result = await list.json();
  assert.equal(result.total, 1);
  assert.equal(result.items[0].mobile, '138****5678');
  const csv = await fetch(`${base}/api/admin/visitors/export.csv?date_from=${today}&date_to=${today}`, { headers: { Cookie: cookie } });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /示例公司/);
});
