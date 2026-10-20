import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PASSWORD = "demo-cutline-2026";

async function login(page: Page, email: string) {
  await page.goto("/staff");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/staff\/calendar/);
}

async function firstSlot(request: APIRequestContext, serviceName = "Мужская стрижка", barberName?: string) {
  // Discover ids from the catalog serialized into the /book page.
  const book = await (await request.get("/demo/book")).text();
  const svc = [...book.matchAll(/\\"id\\":\\"([0-9a-f-]{36})\\",\\"name\\":\\"([^\\]+)\\"/g)].find((m) => m[2] === serviceName)!;
  const sid = svc[1]!;
  let barber = "any";
  if (barberName) {
    barber = [...book.matchAll(/\\"id\\":\\"([0-9a-f-]{36})\\",\\"name\\":\\"([^\\]+)\\"/g)].find((m) => m[2] === barberName)![1]!;
  }
  for (let i = 1; i < 14; i++) {
    const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const r = await (await request.get(`/api/public/slots?service=${sid}&barber=${barber}&date=${d}`)).json();
    if (r.slots.length) return { serviceId: sid, barberId: r.slots[0].barberIds[0] as string, startAt: r.slots[0].startAt as string, offers: r.offers, raw: r };
  }
  throw new Error("no slots");
}

test("A08: staff area and export require a session; public API leaks no contacts", async ({ page, request }) => {
  await page.goto("/staff/calendar");
  await expect(page).toHaveURL(/\/staff$/);
  await page.goto("/staff/bookings");
  await expect(page).toHaveURL(/\/staff$/);
  expect((await request.get("/staff/export")).status()).toBe(404);
  const res = await request.get("/staff");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");

  const s = await firstSlot(request);
  const body = JSON.stringify(s.raw);
  expect(body).not.toMatch(/Демо-клиент|\+998/);
  expect(Object.keys(s.raw.slots[0]).sort()).toEqual(["barberIds", "startAt"]);
});

test("A02/A03: parallel bookings of one slot over HTTP; retry with same key is idempotent", async ({ playwright, baseURL }) => {
  const a = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const b = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const s = await firstSlot(a, "Оформление бороды", "Дмитрий");
  const price = s.offers.find((o: { barberId: string }) => o.barberId === s.barberId).priceUzs;
  const body = (key: string, phone: string) => ({
    serviceId: s.serviceId, barberId: s.barberId, startAt: s.startAt, expectedPriceUzs: price,
    name: "Гонка", phone, consent: true, consentVersion: "demo-2026-10", idempotencyKey: key,
  });
  const [r1, r2] = await Promise.all([
    a.post("/api/public/bookings", { data: body(randomUUID(), "+998901110001") }),
    b.post("/api/public/bookings", { data: body(randomUUID(), "+998901110002") }),
  ]);
  const statuses = [r1.status(), r2.status()].sort();
  expect(statuses).toEqual([201, 409]);
  const loser = r1.status() === 409 ? r1 : r2;
  const err = (await loser.json()).error;
  expect(err.code).toBe("slot_taken");
  expect(err.details.alternatives.length).toBeGreaterThan(0);

  // Idempotent retry
  const key = randomUUID();
  const s2 = await firstSlot(a, "Стрижка машинкой", "Дмитрий");
  const data = { ...body(key, "+998901110003"), serviceId: s2.serviceId, startAt: s2.startAt, expectedPriceUzs: s2.offers[0].priceUzs };
  const [x, y] = await Promise.all([a.post("/api/public/bookings", { data }), a.post("/api/public/bookings", { data })]);
  const z = await a.post("/api/public/bookings", { data });
  const codes = new Set([(await x.json()).code, (await y.json()).code, (await z.json()).code]);
  expect(codes.size).toBe(1);
  expect([x.status(), y.status(), z.status()].filter((st) => st === 201)).toHaveLength(1);

  // Cross-site POST is refused.
  const evil = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: "https://evil.example" } });
  expect((await evil.post("/api/public/bookings", { data: body(randomUUID(), "+998901110004") })).status()).toBe(403);
});

test("barber sees only own bookings and no admin pages", async ({ page }) => {
  await login(page, "timur@demo.cutline");
  await page.goto("/staff/bookings");
  const rows = page.locator("table tbody tr");
  const n = await rows.count();
  for (let i = 0; i < n; i++) await expect(rows.nth(i)).toContainText("Тимур");
  for (const p of ["/staff/services", "/staff/settings", "/staff/users", "/staff/audit", "/staff/new-booking"]) {
    const r = await page.goto(p);
    expect(r?.status(), p).toBe(404);
  }
  // CSV export is admin-only.
  expect((await page.request.get("/staff/export")).status()).toBe(404);
});

test("barber cannot open another barber's booking", async ({ page, browser }) => {
  const admin = await browser.newPage();
  await login(admin, "admin@demo.cutline");
  await admin.goto("/staff/bookings?barber=");
  // find a booking of Алишер
  const link = admin.locator("table tbody tr", { hasText: "Алишер" }).first().locator("a").first();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  await login(page, "timur@demo.cutline");
  const r = await page.goto(href!);
  expect(r?.status()).toBe(404);
});

test("admin: A10 closing a day with bookings is refused with the list; cancel with reason", async ({ page }) => {
  await login(page, "admin@demo.cutline");
  await page.goto("/staff/bookings?status=confirmed");
  const first = page.locator("table tbody tr").first();
  await first.locator("a").first().click();
  await expect(page.getByRole("heading", { name: /Запись/ })).toBeVisible();
  const when = (await page.locator("dl dd").first().textContent())!;
  const code = (await page.getByRole("heading", { name: /Запись/ }).textContent())!.replace("Запись ", "").trim();

  // Find the booking's date from the bookings list (dd.mm.yyyy) and try to close the salon that day.
  await page.goto(`/staff/bookings?q=${code}`);
  const dateText = (await page.locator("table tbody tr td").first().textContent())!.slice(0, 10);
  const [dd, mm, yyyy] = dateText.split(".");
  await page.goto("/staff/schedule");
  await page.getByLabel("Дата").fill(`${yyyy}-${mm}-${dd}`);
  await page.getByRole("button", { name: "Сохранить исключение" }).click();
  const conflict = page.getByRole("alert").filter({ hasText: "Изменение затрагивает" });
  await expect(conflict).toContainText("Изменение не сохранено");
  await expect(conflict).toContainText(code);

  // Cancel the booking with a reason, then the closure goes through... only if no other booking that day.
  await page.goto(`/staff/bookings?q=${code}`);
  await page.locator("table tbody tr a").first().click();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await page.getByLabel("Причина (видна в журнале)").fill("Салон закрыт");
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await expect(page.getByText("Отменена салоном")).toBeVisible();
  await expect(page.getByText("Причина: Салон закрыт")).toBeVisible();
  expect(when.length).toBeGreaterThan(5);

  await page.goto("/staff/audit");
  await expect(page.locator("table")).toContainText("booking.cancelled");
  await expect(page.locator("table")).not.toContainText("+998");
});

test("admin calendar renders day and week", async ({ page }) => {
  await login(page, "admin@demo.cutline");
  await expect(page.getByRole("link", { name: "День", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Неделя", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
});
