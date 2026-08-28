process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'test-password';

const test = require('node:test');
const assert = require('node:assert/strict');
const { server, validateVisitor, hashPassword, verifyPassword, dateRange } = require('./server');

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
  const payload = { name: '张三', mobile: '13812345678', company: '示例公司', host_name: '李工', visit_reason: '项目交流', companions: 1, vehicle_plate: '' };
  const created = await fetch(`${base}/api/visitors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(created.status, 201);
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
