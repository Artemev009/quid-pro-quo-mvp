import { env } from "cloudflare:workers";

type Application = {
  id: string; token: string; company: string; inn: string; person: string; revenue: number;
  purpose: string; amount: number; term: number; goal: string; status: string; note: string;
  offer: null | { amount: number; term: number; rate: number };
  createdAt: string; updatedAt: string;
  history: Array<{ at: string; actor: string; event: string; note?: string; message?: string; offer?: unknown }>;
};
const statuses: Record<string, string> = { submitted: "Новая", reviewing: "На рассмотрении", needs_info: "Нужны сведения", offered: "Предложение", approved: "Одобрена", declined: "Отказ" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const visible = (item: Application) => { const { token: _token, ...rest } = item; void _token; return rest; };
const db = () => { if (!env.DB) throw new Error("Database unavailable"); return env.DB; };
async function input(request: Request) {
  const raw = await request.text();
  if (raw.length > 10000) throw new Error("Слишком большой запрос");
  try { return JSON.parse(raw || "{}") as Record<string, unknown>; }
  catch { throw new Error("Некорректный JSON"); }
}
async function load(id: string): Promise<Application | null> {
  const row = await db().prepare("SELECT payload FROM applications WHERE id = ?").bind(id).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) as Application : null;
}
async function save(item: Application) {
  await db().prepare("UPDATE applications SET payload = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(item), item.status, item.updatedAt, item.id).run();
}
async function handle(request: Request) {
  const pathname = new URL(request.url).pathname;
  const method = request.method;
  try {
    if (pathname === "/api/health" && method === "GET") return json({ ok: true });
    if (pathname === "/api/applications" && method === "POST") {
      const data = await input(request);
      const company = clean(data.company, 80), inn = clean(data.inn, 12), person = clean(data.person, 60), purpose = clean(data.purpose, 300);
      const revenue = Number(data.revenue), amount = Number(data.amount), term = Number(data.term);
      if (!company || !person || !purpose || !/^(\d{10}|\d{12})$/.test(inn) || !Number.isFinite(revenue) || revenue < 0 || !Number.isInteger(amount) || amount < 100000 || amount > 10000000 || ![6, 12, 24, 36].includes(term) || !["turnover", "equipment", "growth"].includes(String(data.goal))) return json({ error: "Проверьте данные заявки" }, 400);
      const now = new Date().toISOString();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, "0")).join("");
      const item: Application = { id: crypto.randomUUID(), token, company, inn, person, revenue, purpose, amount, term, goal: String(data.goal), status: "submitted", note: "", offer: null, createdAt: now, updatedAt: now, history: [{ at: now, actor: "client", event: "Заявка отправлена" }] };
      await db().prepare("INSERT INTO applications (id, token, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(item.id, token, JSON.stringify(item), item.status, now, now).run();
      return json({ id: item.id, token, application: visible(item) }, 201);
    }
    const client = pathname.match(/^\/api\/applications\/([0-9a-f-]{36})(?:\/reply)?$/);
    if (client) {
      const item = await load(client[1]);
      if (!item) return json({ error: "Заявка не найдена" }, 404);
      if (request.headers.get("authorization") !== `Bearer ${item.token}`) return json({ error: "Нет доступа к заявке" }, 403);
      if (method === "GET" && !pathname.endsWith("/reply")) return json(visible(item));
      if (method === "POST" && pathname.endsWith("/reply")) {
        const data = await input(request), message = clean(data.message, 500);
        if (item.status !== "needs_info" || !message) return json({ error: "Ответ сейчас не требуется" }, 400);
        const now = new Date().toISOString(); item.status = "reviewing"; item.updatedAt = now;
        item.history.push({ at: now, actor: "client", event: "Клиент прислал уточнение", message });
        await save(item); return json(visible(item));
      }
      return json({ error: "Метод не поддерживается" }, 405);
    }
    if (pathname.startsWith("/api/bank/")) {
      if (!env.BANK_DEMO_PIN || request.headers.get("x-bank-pin") !== env.BANK_DEMO_PIN) return json({ error: "Неверный демо-код банка" }, 401);
      if (pathname === "/api/bank/applications" && method === "GET") {
        const rows = await db().prepare("SELECT payload FROM applications ORDER BY created_at DESC LIMIT 200").all<{ payload: string }>();
        return json({ applications: rows.results.map(row => visible(JSON.parse(row.payload) as Application)), statuses });
      }
      const match = pathname.match(/^\/api\/bank\/applications\/([0-9a-f-]{36})$/);
      if (match && method === "PATCH") {
        const item = await load(match[1]);
        if (!item) return json({ error: "Заявка не найдена" }, 404);
        const data = await input(request), status = String(data.status), note = clean(data.note, 500);
        if (!statuses[status] || status === "submitted") return json({ error: "Выберите действие по заявке" }, 400);
        if (status === "needs_info" && !note) return json({ error: "Напишите, что нужно уточнить" }, 400);
        let offer: Application["offer"] = null;
        if (status === "offered") {
          const offerAmount = Number(data.offerAmount), offerTerm = Number(data.offerTerm), offerRate = Number(data.offerRate);
          if (!Number.isInteger(offerAmount) || offerAmount < 100000 || offerAmount > 10000000 || ![6, 12, 24, 36].includes(offerTerm) || !Number.isFinite(offerRate) || offerRate <= 0 || offerRate > 100) return json({ error: "Проверьте условия предложения" }, 400);
          offer = { amount: offerAmount, term: offerTerm, rate: offerRate };
        }
        const now = new Date().toISOString(); item.status = status; item.note = note; item.offer = offer; item.updatedAt = now;
        item.history.push({ at: now, actor: "bank", event: statuses[status], note, offer });
        await save(item); return json(visible(item));
      }
    }
    return json({ error: "Не найдено" }, 404);
  } catch (error) {
    if (error instanceof Error && ["Некорректный JSON", "Слишком большой запрос"].includes(error.message)) return json({ error: error.message }, 400);
    return json({ error: "Ошибка сервера" }, 500);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
