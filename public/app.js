const form = document.querySelector('#visitor-form');
const message = document.querySelector('#form-message');
const successPanel = document.querySelector('#registration-success');
const receiptNode = (name) => document.querySelector(`[data-receipt="${name}"]`);
const errorFor = (name) => document.querySelector(`[data-error="${name}"]`);

function formatReceiptTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function showReceipt(visitor) {
  const values = {
    created_at: formatReceiptTime(visitor.created_at),
    name: visitor.name,
    mobile: visitor.mobile,
    company: visitor.company,
    host_name: visitor.host_name,
    visit_reason: visitor.visit_reason,
    companions: String(visitor.companions),
    vehicle_plate: visitor.vehicle_plate || '未填写'
  };
  Object.entries(values).forEach(([name, value]) => { receiptNode(name).textContent = value; });
  form.hidden = true;
  successPanel.hidden = false;
  successPanel.focus();
}

function showErrors(fields = {}) {
  document.querySelectorAll('[data-error]').forEach((node) => { node.textContent = ''; });
  Object.entries(fields).forEach(([name, text]) => { const node = errorFor(name); if (node) node.textContent = text; });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); showErrors(); message.textContent = ''; message.className = 'message';
  const button = form.querySelector('button'); button.disabled = true; button.textContent = '提交中…';
  const body = Object.fromEntries(new FormData(form).entries()); body.companions = Number(body.companions);
  try {
    let response = await fetch('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let result = await response.json();
    if (response.status === 409 && result.duplicate && window.confirm(result.error + '\n是否继续提交？')) {
      body.confirm_duplicate = true;
      response = await fetch('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); result = await response.json();
    }
    if (!response.ok) { showErrors(result.fields); throw new Error(result.error || '提交失败'); }
    form.reset(); form.elements.companions.value = '0'; showReceipt(result.visitor);
  } catch (error) { message.textContent = error.message || '提交失败，请稍后重试'; }
  finally { button.disabled = false; button.textContent = '提交登记'; }
});
