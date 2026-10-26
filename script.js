const goals = {
  turnover: { label: 'Пополнить оборот', icon: '↗', title: 'Кредит на оборот', description: 'Средства на закупки, пополнение склада и текущие расходы.', rate: 'от 18%*' },
  equipment: { label: 'Купить оборудование', icon: '◈', title: 'Кредит на оборудование', description: 'Финансирование новой техники и модернизации бизнеса.', rate: 'от 16%*' },
  growth: { label: 'Развивать бизнес', icon: '▥', title: 'Кредит на развитие', description: 'Для открытия новой точки или запуска направления.', rate: 'от 20%*' }
};
const terms = [6, 12, 24, 36];
const labels = { submitted: 'Новая', reviewing: 'На рассмотрении', needs_info: 'Нужны сведения', offered: 'Предложение', approved: 'Одобрена', declined: 'Отказ' };
const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { goal: 'equipment', amount: 1500000, term: 12, mode: 'client', selected: null, filter: 'all', applications: [] };
const saved = () => { try { return JSON.parse(localStorage.getItem('qpq-current-application') || 'null'); } catch { return null; } };
const bankPin = () => sessionStorage.getItem('qpq-bank-pin') || '';
const apiOrigin = location.hostname === 'artemev009.github.io' ? 'https://quid-pro-quo-bank-demo.perospilsa.chatgpt.site' : '';
function assess(item) {
  if (item.freeCash === undefined || !item.collateral) return null;
  const monthlyRate = 0.20 / 12; // Только ориентир для учебной проверки, не ставка банка.
  const payment = Math.round(item.amount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -item.term)));
  const cashGap = Number(item.freeCash) < payment;
  const missingCollateral = item.collateral === 'no';
  const steps = [];
  if (cashGap) steps.push('Запрошенный платёж может быть выше свободных средств. Рассмотрите меньшую сумму или другой срок и проверьте полную стоимость.');
  if (missingCollateral) steps.push('Нет залога: сотрудник может проверить возможность поручительства МСП, если остальные условия подходят.');
  if (item.collateral === 'unsure') steps.push('Уточните, есть ли подходящее обеспечение или доступна гарантийная поддержка.');
  if (item.goal === 'equipment' && cashGap) steps.push('Для покупки оборудования можно отдельно рассмотреть лизинг.');
  if (item.goal === 'turnover' && cashGap) steps.push('Если деньги нужны до оплаты уже выполненного заказа, можно проверить факторинг.');
  if (!steps.length) steps.push('Явного препятствия по этим двум параметрам нет. Банку всё равно нужно проверить документы и другие обязательства.');
  return { payment, cashGap, missingCollateral, steps };
}
function adviceHtml(item, bank = false) {
  const result = assess(item);
  if (!result) return '';
  return `<div class="advice-box"><span class="tag">Автоподсказка · демо</span><h3>${bank ? 'Что проверить сотруднику' : 'Что можно сделать дальше'}</h3><p>Ориентир платежа при условных 20% годовых: <strong>${money(result.payment)} / мес.</strong> Свободные средства: <strong>${money(item.freeCash)} / мес.</strong></p><ul>${result.steps.map(step => `<li>${step}</li>`).join('')}</ul><small>Предварительная проверка по введённым данным. Это не одобрение, скоринг или предложение банка.</small></div>`;
}
function suggestedRequest(item) {
  const result = assess(item);
  if (!result) return 'Уточните, пожалуйста, данные по выручке и цели финансирования.';
  const parts = [];
  if (result.cashGap) parts.push('Уточните свободные средства после расходов и действующие кредитные платежи. Можно рассмотреть меньшую сумму или иной срок.');
  if (result.missingCollateral) parts.push('Сообщите, есть ли иное обеспечение и готовы ли вы рассмотреть поручительство МСП.');
  if (!parts.length) parts.push('Пришлите подтверждение выручки и расходов для дальнейшей проверки заявки.');
  return parts.join(' ');
}
function renderPrecheck() {
  const form = document.getElementById('application-form');
  const freeCash = form.elements.freeCash.value;
  const collateral = form.elements.collateral.value;
  const revenue = form.elements.revenue.value;
  form.elements.freeCash.setCustomValidity(revenue !== '' && freeCash !== '' && Number(freeCash) > Number(revenue) ? 'Свободные средства не могут превышать выручку' : '');
  document.getElementById('precheck').innerHTML = freeCash !== '' && collateral ? adviceHtml({ amount: state.amount, term: state.term, goal: state.goal, freeCash: Number(freeCash), collateral }) : 'Укажите свободные средства и наличие залога — увидите предварительную подсказку.';
}

async function api(url, options = {}, bank = false) {
  let response;
  try { response = await fetch(apiOrigin + url, { ...options, headers: { 'Content-Type': 'application/json', ...(bank ? { 'X-Bank-Pin': bankPin() } : {}), ...(options.headers || {}) } }); }
  catch { throw new Error('Нет связи с сервером. Запустите приложение через сервер из README.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('Сервер заявок недоступен на этом адресе.'); }
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить действие');
  return result;
}
function show(id) {
  state.mode = id === 'bank' ? 'bank' : 'client';
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === id));
  document.querySelectorAll('.client-nav').forEach(el => el.hidden = state.mode !== 'client');
  document.querySelectorAll('.bank-nav').forEach(el => el.hidden = state.mode !== 'bank');
  document.getElementById('mode-switch').textContent = state.mode === 'bank' ? '← Версия для клиента' : 'Кабинет банка →';
  if (id === 'status') renderStatus();
  if (id === 'bank') renderBank();
  if (id === 'application') renderPrecheck();
  history.replaceState(null, '', location.pathname + location.search + '#' + id);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
function renderOffers() {
  document.getElementById('goal-choices').innerHTML = Object.entries(goals).map(([key, g]) => `<button type="button" class="choice ${key === state.goal ? 'selected' : ''}" data-select-goal="${key}" aria-pressed="${key === state.goal}"><span>${g.icon}</span><b>${g.label}</b></button>`).join('');
  document.getElementById('term-choices').innerHTML = terms.map(n => `<button type="button" class="term ${n === state.term ? 'selected' : ''}" data-term="${n}" aria-pressed="${n === state.term}">${n} мес.</button>`).join('');
  document.getElementById('amount').value = state.amount;
  document.getElementById('amount-output').textContent = money(state.amount);
  document.getElementById('offer-title').textContent = goals[state.goal].title;
  document.getElementById('offer-description').textContent = goals[state.goal].description;
  document.getElementById('offer-amount').textContent = money(state.amount);
  document.getElementById('offer-term').textContent = state.term + ' мес.';
  document.getElementById('offer-rate').textContent = goals[state.goal].rate;
}
async function renderStatus() {
  const host = document.getElementById('status-content'), access = saved();
  if (!access) { host.innerHTML = '<div class="status-card"><span class="status-badge">Пока пусто</span><h2>Вы ещё не отправили заявку</h2><p>Выберите цель бизнеса и заполните короткую форму.</p><button class="btn primary" data-go="offers">Подобрать кредит →</button></div>'; return; }
  host.innerHTML = '<div class="status-card">Загружаем заявку…</div>';
  try {
    const item = await api(`/api/applications/${access.id}`, { headers: { Authorization: `Bearer ${access.token}` } });
    const offer = item.offer ? `<div class="offer-box"><strong>Предложение банка</strong><p>${money(item.offer.amount)} · ${item.offer.term} мес. · ${item.offer.rate}% годовых</p></div>` : '';
    const reply = item.status === 'needs_info' ? '<form id="reply-form" class="panel form"><label>Ответ банку<textarea name="message" required maxlength="500" rows="3" placeholder="Напишите уточнение"></textarea></label><button class="btn primary" type="submit">Отправить уточнение →</button><p class="form-error" role="alert"></p></form>' : '';
    host.innerHTML = `<div class="status-card"><div class="status-head"><span class="status-badge">${labels[item.status] || 'Заявка'}</span><button class="tiny-button" id="refresh-status">Обновить ↻</button></div><h2>${item.status === 'needs_info' ? 'Банку нужна информация' : item.status === 'offered' ? 'Для вас есть предложение' : item.status === 'approved' ? 'Заявка одобрена' : item.status === 'declined' ? 'По заявке отказ' : 'Заявка в работе'}</h2><p>${esc(item.note || 'Мы получили заявку. Решение и запросы банка появятся здесь.')}</p>${offer}${adviceHtml(item)}<div class="summary"><div><span>Компания</span><strong>${esc(item.company)}</strong></div><div><span>Продукт</span><strong>${goals[item.goal]?.title || 'Кредит'}</strong></div><div><span>Сумма</span><strong>${money(item.amount)}</strong></div><div><span>Срок</span><strong>${item.term} мес.</strong></div></div><div class="timeline"><h3>История заявки</h3>${[...item.history].reverse().map(entry => `<div><time>${new Date(entry.at).toLocaleString('ru-RU')}</time><strong>${esc(entry.event)}</strong>${entry.message ? `<p>${esc(entry.message)}</p>` : ''}${entry.note ? `<p>${esc(entry.note)}</p>` : ''}</div>`).join('')}</div></div>${reply}<div class="actions"><button class="btn secondary" data-go="offers">Подобрать ещё</button><button class="btn secondary" id="new-application">Новая заявка</button></div>`;
  } catch (error) { host.innerHTML = `<div class="status-card"><h2>Не удалось загрузить заявку</h2><p>${esc(error.message)}</p><button class="btn secondary" id="refresh-status">Повторить</button></div>`; }
}
async function renderBank() {
  const host = document.getElementById('bank-content');
  if (!bankPin()) { host.innerHTML = '<form id="bank-login" class="panel form login-panel"><h2>Вход в демо-кабинет</h2><p>Введите демо-код сотрудника, полученный от владельца проекта.</p><label>Код сотрудника<input name="pin" type="password" required autocomplete="off" placeholder="Введите демо-код"></label><button class="btn primary" type="submit">Открыть заявки →</button><p class="form-error" role="alert"></p></form>'; return; }
  host.innerHTML = '<div class="status-card">Загружаем очередь заявок…</div>';
  try { const data = await api('/api/bank/applications', {}, true); state.applications = data.applications; drawBank(); }
  catch (error) { if (error.message.includes('код')) sessionStorage.removeItem('qpq-bank-pin'); host.innerHTML = `<div class="status-card"><h2>Не удалось открыть кабинет</h2><p>${esc(error.message)}</p><button class="btn secondary" id="retry-bank">Повторить</button></div>`; }
}
function drawBank() {
  const host = document.getElementById('bank-content');
  const counts = { all: state.applications.length, submitted: state.applications.filter(x => x.status === 'submitted').length, needs_info: state.applications.filter(x => x.status === 'needs_info').length, offered: state.applications.filter(x => x.status === 'offered').length };
  const rows = state.applications.filter(x => state.filter === 'all' || x.status === state.filter);
  const selected = state.applications.find(x => x.id === state.selected);
  host.innerHTML = `<div class="bank-toolbar"><div class="bank-filters">${Object.entries({ all: 'Все', submitted: 'Новые', needs_info: 'Ждём сведения', offered: 'С предложением' }).map(([key, label]) => `<button class="filter ${state.filter === key ? 'selected' : ''}" data-filter="${key}">${label} <b>${counts[key]}</b></button>`).join('')}</div><div><button class="tiny-button" id="refresh-bank">Обновить ↻</button><button class="tiny-button" id="bank-logout">Выйти</button></div></div><div class="bank-layout"><div class="bank-list">${rows.length ? rows.map(x => `<button class="bank-row ${selected?.id === x.id ? 'selected' : ''}" data-open="${x.id}"><span><strong>${esc(x.company)}</strong><small>${new Date(x.createdAt).toLocaleString('ru-RU')}</small></span><span><b>${money(x.amount)}</b><small class="row-status">${labels[x.status]}</small></span></button>`).join('') : '<div class="empty-list">Пока нет заявок в этой группе.</div>'}</div><div class="bank-detail">${selected ? detailHtml(selected) : '<div class="detail-empty"><strong>Выберите заявку</strong><p>Здесь будут данные бизнеса и действия сотрудника.</p></div>'}</div></div>`;
}
function detailHtml(x) {
  return `<div class="detail-top"><span class="status-badge">${labels[x.status]}</span><small>№ ${x.id.slice(0, 8)}</small></div><h2>${esc(x.company)}</h2><p class="detail-sub">${goals[x.goal]?.title || 'Кредит'} · ${money(x.amount)} · ${x.term} мес.</p><div class="detail-grid"><div><span>ИНН</span><strong>${esc(x.inn)}</strong></div><div><span>Контакт</span><strong>${esc(x.person)}</strong></div><div><span>Месячная выручка</span><strong>${money(x.revenue)}</strong></div><div><span>Свободные средства</span><strong>${x.freeCash === undefined ? "Не указаны" : money(x.freeCash)}</strong></div><div><span>Залог</span><strong>${{yes:"Есть",no:"Нет",unsure:"Не знаю"}[x.collateral] || "Не указано"}</strong></div><div><span>Дата</span><strong>${new Date(x.createdAt).toLocaleDateString('ru-RU')}</strong></div></div>${adviceHtml(x, true)}<div class="detail-purpose"><span>Цель финансирования</span><p>${esc(x.purpose)}</p></div>${x.history.some(h => h.message) ? `<div class="detail-purpose"><span>Уточнение клиента</span><p>${esc([...x.history].reverse().find(h => h.message)?.message)}</p></div>` : ''}<form id="bank-action" class="form"><label>Действие<select name="status" id="bank-status"><option value="reviewing">Взять на рассмотрение</option><option value="needs_info">Запросить сведения</option><option value="offered">Отправить предложение</option><option value="approved">Одобрить</option><option value="declined">Отказать</option></select></label><div class="offer-fields" id="bank-offer-fields" hidden><label>Сумма предложения, ₽<input name="offerAmount" type="number" min="100000" max="10000000" step="100000" value="${x.amount}"></label><label>Срок, месяцев<select name="offerTerm">${terms.map(t => `<option value="${t}" ${t === x.term ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>Ставка, % годовых<input name="offerRate" type="number" min="0.1" max="100" step="0.1" value="18"></label></div><label>Комментарий для клиента<textarea name="note" maxlength="500" rows="3" placeholder="Например, уточните выручку за последние 3 месяца">${esc(x.note || '')}</textarea></label><button class="tiny-button" id="suggest-note" type="button">Сформировать запрос по подсказке ↗</button><button class="btn primary" type="submit">Сохранить и отправить клиенту →</button><p class="form-error" role="alert"></p></form><div class="timeline"><h3>История</h3>${[...x.history].reverse().map(h => `<div><time>${new Date(h.at).toLocaleString('ru-RU')}</time><strong>${esc(h.event)}</strong>${h.message ? `<p>${esc(h.message)}</p>` : ''}${h.note ? `<p>${esc(h.note)}</p>` : ''}</div>`).join('')}</div>`;
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
  const quick = e.target.closest('[data-goal]'); if (quick) { state.goal = quick.dataset.goal; renderOffers(); show('offers'); return; }
  const choice = e.target.closest('[data-select-goal]'); if (choice) { state.goal = choice.dataset.selectGoal; renderOffers(); return; }
  const term = e.target.closest('[data-term]'); if (term) { state.term = Number(term.dataset.term); renderOffers(); return; }
  const filter = e.target.closest('[data-filter]'); if (filter) { state.filter = filter.dataset.filter; drawBank(); return; }
  const row = e.target.closest('[data-open]'); if (row) { state.selected = row.dataset.open; drawBank(); return; }
  if (e.target.id === 'suggest-note') {
    const item = state.applications.find(x => x.id === state.selected);
    if (item) { document.getElementById('bank-status').value = 'needs_info'; document.getElementById('bank-offer-fields').hidden = true; document.querySelector('#bank-action textarea[name="note"]').value = suggestedRequest(item); }
  }
  if (e.target.id === 'mode-switch') show(state.mode === 'bank' ? 'home' : 'bank');
  if (e.target.id === 'refresh-status') renderStatus();
  if (e.target.id === 'refresh-bank' || e.target.id === 'retry-bank') renderBank();
  if (e.target.id === 'bank-logout') { sessionStorage.removeItem('qpq-bank-pin'); state.selected = null; renderBank(); }
  if (e.target.id === 'new-application') { localStorage.removeItem('qpq-current-application'); document.getElementById('application-form').reset(); show('offers'); }
});
document.addEventListener('change', e => { if (e.target.id === 'bank-status') document.getElementById('bank-offer-fields').hidden = e.target.value !== 'offered'; });
document.getElementById('application-form').addEventListener('input', renderPrecheck);
document.getElementById('application-form').addEventListener('change', renderPrecheck);
document.getElementById('amount').addEventListener('input', e => { state.amount = Number(e.target.value); renderOffers(); });
document.addEventListener('submit', async e => {
  if (!['application-form', 'reply-form', 'bank-login', 'bank-action'].includes(e.target.id)) return;
  e.preventDefault();
  const form = e.target, data = Object.fromEntries(new FormData(form)), button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (form.id === 'application-form') {
      const result = await api('/api/applications', { method: 'POST', body: JSON.stringify({ ...data, goal: state.goal, amount: state.amount, term: state.term }) });
      localStorage.setItem('qpq-current-application', JSON.stringify({ id: result.id, token: result.token }));
      show('status');
    } else if (form.id === 'reply-form') {
      const access = saved();
      await api(`/api/applications/${access.id}/reply`, { method: 'POST', headers: { Authorization: `Bearer ${access.token}` }, body: JSON.stringify(data) });
      renderStatus();
    } else if (form.id === 'bank-login') {
      sessionStorage.setItem('qpq-bank-pin', data.pin);
      await api('/api/bank/applications', {}, true);
      renderBank();
    } else {
      await api(`/api/bank/applications/${state.selected}`, { method: 'PATCH', body: JSON.stringify(data) }, true);
      renderBank();
    }
  } catch (error) {
    if (form.id === 'bank-login') sessionStorage.removeItem('qpq-bank-pin');
    const errorNode = form.querySelector('.form-error'); if (errorNode) errorNode.textContent = error.message;
  } finally { button.disabled = false; }
});
renderOffers();
show(['home', 'offers', 'application', 'status', 'bank'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
