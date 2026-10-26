const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'applications.json');
const bankPin = process.env.BANK_DEMO_PIN || 'bank-demo-2026';
const port = Number(process.env.PORT || 8080);
const statuses = { submitted: 'Новая', reviewing: 'На рассмотрении', needs_info: 'Нужны сведения', offered: 'Предложение', approved: 'Одобрена', declined: 'Отказ' };

function readAll() {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function writeAll(items) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temp = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(items, null, 2));
  fs.renameSync(temp, dataFile);
}
function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10000) { reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(Object.assign(new Error('Некорректный JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function clientView(item) { const { token, ...safe } = item; return safe; }
function authorized(req, secret, header) {
  const received = req.headers[header] || '';
  const a = Buffer.from(received);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function staticFile(req, res, pathname) {
  const files = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/script.js': 'script.js', '/assets/trading-floor.png': 'assets/trading-floor.png' };
  const name = files[pathname];
  if (!name) return json(res, 404, { error: 'Не найдено' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
  res.writeHead(200, { 'Content-Type': types[path.extname(name)] });
  fs.createReadStream(path.join(root, name)).pipe(res);
}
async function handler(req, res) {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });
    if (pathname === '/api/applications' && req.method === 'POST') {
      const input = await body(req);
      const company = text(input.company, 80), person = text(input.person, 60), purpose = text(input.purpose, 300), inn = text(input.inn, 12);
      const revenue = Number(input.revenue), freeCash = Number(input.freeCash), amount = Number(input.amount), term = Number(input.term), collateral = input.collateral;
      if (!company || !person || !purpose || !/^(\d{10}|\d{12})$/.test(inn) || !Number.isFinite(revenue) || revenue < 0 || !Number.isFinite(freeCash) || freeCash < 0 || freeCash > revenue || !['yes', 'no', 'unsure'].includes(collateral) || !Number.isInteger(amount) || amount < 100000 || amount > 10000000 || ![6, 12, 24, 36].includes(term) || !['turnover', 'equipment', 'growth'].includes(input.goal)) return json(res, 400, { error: 'Проверьте данные заявки: свободные средства не могут превышать выручку' });
      const now = new Date().toISOString();
      const item = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'), company, inn, person, revenue, freeCash, collateral, purpose, amount, term, goal: input.goal, status: 'submitted', note: '', offer: null, createdAt: now, updatedAt: now, history: [{ at: now, actor: 'client', event: 'Заявка отправлена' }] };
      const all = readAll(); all.unshift(item); writeAll(all);
      return json(res, 201, { id: item.id, token: item.token, application: clientView(item) });
    }
    const clientMatch = pathname.match(/^\/api\/applications\/([0-9a-f-]{36})(?:\/reply)?$/);
    if (clientMatch) {
      const all = readAll(), item = all.find(row => row.id === clientMatch[1]);
      if (!item) return json(res, 404, { error: 'Заявка не найдена' });
      if (!authorized(req, `Bearer ${item.token}`, 'authorization')) return json(res, 403, { error: 'Нет доступа к заявке' });
      if (req.method === 'GET' && !pathname.endsWith('/reply')) return json(res, 200, clientView(item));
      if (req.method === 'POST' && pathname.endsWith('/reply')) {
        const input = await body(req), message = text(input.message, 500);
        if (item.status !== 'needs_info' || !message) return json(res, 400, { error: 'Ответ сейчас не требуется' });
        const now = new Date().toISOString();
        item.status = 'reviewing'; item.updatedAt = now;
        item.history.push({ at: now, actor: 'client', event: 'Клиент прислал уточнение', message });
        writeAll(all);
        return json(res, 200, clientView(item));
      }
      return json(res, 405, { error: 'Метод не поддерживается' });
    }
    if (pathname.startsWith('/api/bank/')) {
      if (!authorized(req, bankPin, 'x-bank-pin')) return json(res, 401, { error: 'Неверный демо-код банка' });
      const all = readAll();
      if (pathname === '/api/bank/applications' && req.method === 'GET') return json(res, 200, { applications: all.map(clientView), statuses });
      const match = pathname.match(/^\/api\/bank\/applications\/([0-9a-f-]{36})$/);
      if (match && req.method === 'PATCH') {
        const item = all.find(row => row.id === match[1]);
        if (!item) return json(res, 404, { error: 'Заявка не найдена' });
        const input = await body(req), status = input.status, note = text(input.note, 500);
        if (!statuses[status] || status === 'submitted') return json(res, 400, { error: 'Выберите действие по заявке' });
        if (status === 'needs_info' && !note) return json(res, 400, { error: 'Напишите, что нужно уточнить' });
        let offer = null;
        if (status === 'offered') {
          const amount = Number(input.offerAmount), term = Number(input.offerTerm), rate = Number(input.offerRate);
          if (!Number.isInteger(amount) || amount < 100000 || amount > 10000000 || ![6, 12, 24, 36].includes(term) || !Number.isFinite(rate) || rate <= 0 || rate > 100) return json(res, 400, { error: 'Проверьте условия предложения' });
          offer = { amount, term, rate };
        }
        const now = new Date().toISOString();
        item.status = status; item.note = note; item.offer = offer; item.updatedAt = now;
        item.history.push({ at: now, actor: 'bank', event: statuses[status], note, offer });
        writeAll(all);
        return json(res, 200, clientView(item));
      }
      return json(res, 404, { error: 'Не найдено' });
    }
    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Не найдено' });
    if (req.method !== 'GET') return json(res, 405, { error: 'Метод не поддерживается' });
    return staticFile(req, res, pathname);
  } catch (error) { if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Ошибка сервера' }); }
}
if (require.main === module) http.createServer(handler).listen(port, () => console.log(`Quid Pro Quo: http://localhost:${port}`));
module.exports = { handler };
