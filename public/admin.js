const loginView = document.querySelector('#login-view');
const dashboard = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const rows = document.querySelector('#visitor-rows');
const filterForm = document.querySelector('#filter-form');
const listMessage = document.querySelector('#list-message');
const detailDialog = document.querySelector('#detail-dialog');
const detailList = document.querySelector('#detail-list');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatTime = (value) => new Date(value).toLocaleString('zh-CN', { hour12: false });

async function api(url, options) {
  const response = await fetch(url, options); const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败'); return data;
}

function dates() { const today = new Date().toISOString().slice(0, 10); if (!filterForm.elements.date_from.value) filterForm.elements.date_from.value = today; if (!filterForm.elements.date_to.value) filterForm.elements.date_to.value = today; }

async function loadVisitors() {
  dates(); const params = new URLSearchParams(Object.fromEntries(new FormData(filterForm).entries())); listMessage.textContent = '加载中…';
  try { const data = await api(`/api/admin/visitors?${params}`); rows.innerHTML = data.items.length ? data.items.map((item) => `<tr><td>${esc(formatTime(item.created_at))}</td><td>${esc(item.name)}</td><td>${esc(item.mobile)}</td><td>${esc(item.company)}</td><td>${esc(item.host_name)}</td><td>${esc(item.visit_reason)}</td><td>${esc(item.companions)}</td><td>${esc(item.vehicle_plate)}</td><td><button class="action-link" data-detail="${esc(item.id)}">详情</button><button class="action-link" data-hide="${esc(item.id)}">隐藏</button></td></tr>`).join('') : '<tr><td colspan="9">暂无符合条件的访客记录</td></tr>'; listMessage.textContent = `共 ${data.total} 条记录`; }
  catch (error) { if (error.message.includes('登录')) showLogin(); else listMessage.textContent = error.message; }
}

function showDashboard() { loginView.hidden = true; dashboard.hidden = false; loadVisitors(); }
function showLogin() { loginView.hidden = false; dashboard.hidden = true; }

loginForm.addEventListener('submit', async (event) => { event.preventDefault(); const message = document.querySelector('#login-message'); try { await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(loginForm).entries())) }); showDashboard(); } catch (error) { message.textContent = error.message; } });
filterForm.addEventListener('submit', (event) => { event.preventDefault(); loadVisitors(); });
document.querySelector('#logout-button').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); showLogin(); });
document.querySelector('#export-button').addEventListener('click', () => { dates(); const params = new URLSearchParams(Object.fromEntries(new FormData(filterForm).entries())); window.location.href = `/api/admin/visitors/export.csv?${params}`; });
rows.addEventListener('click', async (event) => { const detailId = event.target.dataset.detail; const hideId = event.target.dataset.hide; try { if (detailId) { const item = await api(`/api/admin/visitors/${detailId}`); detailList.innerHTML = Object.entries({ 登记时间: formatTime(item.created_at), 姓名: item.name, 手机号: item.mobile, 公司: item.company, 被访人: item.host_name, 来访事由: item.visit_reason, 同行人数: item.companions, 车牌号: item.vehicle_plate || '未填写' }).map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join(''); detailDialog.showModal(); } if (hideId && window.confirm('确认隐藏这条记录？')) { await api(`/api/admin/visitors/${hideId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'hidden' }) }); loadVisitors(); } } catch (error) { listMessage.textContent = error.message; } });
document.querySelector('.dialog-close').addEventListener('click', () => detailDialog.close());
api('/api/admin/me').then(showDashboard).catch(showLogin);
