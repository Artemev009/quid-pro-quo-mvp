const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qpq-'));
process.env.DATA_FILE = path.join(dir, 'applications.json');
process.env.BANK_DEMO_PIN = 'test-bank-pin';
const { handler } = require('../server');

test('client application and bank decision are shared via server', async t => {
  const server = http.createServer(handler).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, options = {}) => {
    const response = await fetch(base + route, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    return { code: response.status, data: await response.json() };
  };
  const submitted = await call('/api/applications', { method: 'POST', body: JSON.stringify({ company: 'Демо Кофе', inn: '1234567890', person: 'Анна', revenue: 800000, freeCash: 120000, collateral: 'no', purpose: 'Новая кофемашина', amount: 1500000, term: 12, goal: 'equipment' }) });
  assert.equal(submitted.code, 201);
  const { id, token } = submitted.data;
  assert.equal((await call('/api/bank/applications')).code, 401);
  const bankHeaders = { 'X-Bank-Pin': 'test-bank-pin' };
  const queue = await call('/api/bank/applications', { headers: bankHeaders });
  assert.equal(queue.data.applications[0].company, 'Демо Кофе');
  assert.equal(queue.data.applications[0].freeCash, 120000);
  assert.equal(queue.data.applications[0].collateral, 'no');
  assert.equal(queue.data.applications[0].token, undefined);
  const clientHeaders = { Authorization: `Bearer ${token}` };
  assert.equal((await call(`/api/applications/${id}`)).code, 403);
  const request = await call(`/api/bank/applications/${id}`, { method: 'PATCH', headers: bankHeaders, body: JSON.stringify({ status: 'needs_info', note: 'Уточните среднюю выручку' }) });
  assert.equal(request.data.status, 'needs_info');
  const reply = await call(`/api/applications/${id}/reply`, { method: 'POST', headers: clientHeaders, body: JSON.stringify({ message: '800 тысяч рублей' }) });
  assert.equal(reply.data.status, 'reviewing');
  const offer = await call(`/api/bank/applications/${id}`, { method: 'PATCH', headers: bankHeaders, body: JSON.stringify({ status: 'offered', note: 'Предварительные условия', offerAmount: 1200000, offerTerm: 12, offerRate: 17.5 }) });
  assert.equal(offer.data.offer.rate, 17.5);
  const client = await call(`/api/applications/${id}`, { headers: clientHeaders });
  assert.equal(client.data.status, 'offered');
  assert.equal(client.data.history.length, 4);
  assert.equal(client.data.token, undefined);
  assert.equal(client.data.freeCash, 120000);
});
