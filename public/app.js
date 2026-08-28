const form = document.querySelector('#visitor-form');
const message = document.querySelector('#form-message');
const errorFor = (name) => document.querySelector(`[data-error="${name}"]`);

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
    form.reset(); form.elements.companions.value = '0'; message.textContent = '登记成功，请联系前台并告知被访人姓名。'; message.className = 'message success';
  } catch (error) { message.textContent = error.message || '提交失败，请稍后重试'; }
  finally { button.disabled = false; button.textContent = '提交登记'; }
});
