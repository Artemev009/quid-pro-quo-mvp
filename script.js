const goals = {
  turnover: { label: 'Пополнить оборот', icon: '↗', title: 'Кредит на оборот', description: 'Средства на закупки, пополнение склада и текущие расходы.', rate: 'от 18%*' },
  equipment: { label: 'Купить оборудование', icon: '◈', title: 'Кредит на оборудование', description: 'Финансирование новой техники и модернизации бизнеса.', rate: 'от 16%*' },
  growth: { label: 'Развивать бизнес', icon: '▥', title: 'Кредит на развитие', description: 'Для открытия новой точки или запуска направления.', rate: 'от 20%*' }
};
const terms = [6, 12, 24, 36];
const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
const state = { goal: 'equipment', amount: 1500000, term: 12 };
const saved = () => { try { return JSON.parse(localStorage.getItem('quid-pro-quo-application') || 'null'); } catch { return null; } };
const save = value => localStorage.setItem('quid-pro-quo-application', JSON.stringify(value));

function show(id) {
  if (id === 'status') renderStatus();
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === id));
  history.replaceState(null, '', '#' + id);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
function renderOffers() {
  const choices = document.getElementById('goal-choices');
  choices.innerHTML = Object.entries(goals).map(([key, g]) => `<button type="button" class="choice ${key === state.goal ? 'selected' : ''}" data-select-goal="${key}" aria-pressed="${key === state.goal}"><span>${g.icon}</span><b>${g.label}</b></button>`).join('');
  const termChoices = document.getElementById('term-choices');
  termChoices.innerHTML = terms.map(n => `<button type="button" class="term ${n === state.term ? 'selected' : ''}" data-term="${n}" aria-pressed="${n === state.term}">${n} мес.</button>`).join('');
  document.getElementById('amount').value = state.amount;
  document.getElementById('amount-output').textContent = money(state.amount);
  document.getElementById('offer-title').textContent = goals[state.goal].title;
  document.getElementById('offer-description').textContent = goals[state.goal].description;
  document.getElementById('offer-amount').textContent = money(state.amount);
  document.getElementById('offer-term').textContent = state.term + ' мес.';
  document.getElementById('offer-rate').textContent = goals[state.goal].rate;
}
function renderStatus() {
  const item = saved(), host = document.getElementById('status-content');
  if (!item) { host.innerHTML = '<div class="status-card"><span class="status-badge">Пока пусто</span><h2>Вы ещё не отправили заявку</h2><p>Выберите цель бизнеса и заполните короткую форму — здесь появится результат.</p><button class="btn primary" data-go="offers">Подобрать кредит →</button></div>'; return; }
  const result = item.result === 'review' ? { badge: 'На проверке', title: 'Нужна дополнительная проверка', text: 'Мы сохранили вашу заявку. В демонстрационном сценарии такая сумма требует рассмотрения сотрудником.' } : item.result === 'offer' ? { badge: 'Предварительное предложение', title: 'Есть вариант финансирования', text: 'Демонстрационная проверка завершена. Это пример предложения; настоящее решение банка здесь не принимается.' } : { badge: 'Нужны сведения', title: 'Уточните данные бизнеса', text: 'Для демонстрации мы запросили дополнительную информацию о компании.' };
  host.innerHTML = `<div class="status-card"><span class="status-badge">${result.badge}</span><h2>${result.title}</h2><p>${result.text}</p><div class="summary"><div><span>Компания</span><strong id="s-company"></strong></div><div><span>Продукт</span><strong id="s-product"></strong></div><div><span>Сумма</span><strong id="s-amount"></strong></div><div><span>Срок</span><strong id="s-term"></strong></div></div></div><div class="actions"><button class="btn secondary" data-go="offers">Изменить условия</button><button class="btn secondary" id="reset-application">Подать новую заявку</button></div>`;
  document.getElementById('s-company').textContent = item.company;
  document.getElementById('s-product').textContent = goals[item.goal].title;
  document.getElementById('s-amount').textContent = money(item.amount);
  document.getElementById('s-term').textContent = item.term + ' мес.';
}
document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
  const quick = e.target.closest('[data-goal]'); if (quick) { state.goal = quick.dataset.goal; renderOffers(); show('offers'); return; }
  const choice = e.target.closest('[data-select-goal]'); if (choice) { state.goal = choice.dataset.selectGoal; renderOffers(); return; }
  const term = e.target.closest('[data-term]'); if (term) { state.term = Number(term.dataset.term); renderOffers(); return; }
  if (e.target.id === 'reset-application') { localStorage.removeItem('quid-pro-quo-application'); document.getElementById('application-form').reset(); show('offers'); }
});
document.getElementById('amount').addEventListener('input', e => { state.amount = Number(e.target.value); renderOffers(); });
document.getElementById('application-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  const result = state.amount > 5000000 ? 'review' : Number(data.revenue) < 300000 ? 'details' : 'offer';
  save({ ...data, ...state, result, createdAt: new Date().toISOString() });
  show('status');
});
renderOffers();
show(['home', 'offers', 'application', 'status'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
