// Captures README screenshots from a running instance with demo data.
// Usage: BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = "docs/screenshots";
const browser = await chromium.launch();
const ctx = (w, h, extra = {}) => browser.newContext({ viewport: { width: w, height: h }, locale: "ru-RU", timezoneId: "Asia/Tashkent", ...extra });

const desk = await (await ctx(1440, 900)).newPage();
await desk.goto(base + "/", { waitUntil: "networkidle" });
await desk.screenshot({ path: `${out}/01-home-desktop.png` });
await desk.goto(base + "/services", { waitUntil: "networkidle" });
await desk.screenshot({ path: `${out}/02-services.png`, fullPage: true });
await desk.goto(base + "/book", { waitUntil: "networkidle" });
await desk.getByRole("button", { name: /^Мужская стрижка/ }).click();
await desk.screenshot({ path: `${out}/03-book-barber.png` });
await desk.getByRole("button", { name: /Любой мастер/ }).click();
// Pick a day a few days ahead so the booking is outside the 12 h change cutoff.
await desk.locator('[role=grid] button[aria-label*="есть время"]').nth(3).click();
const slot = desk.locator("#pick-time-h ~ div button[aria-pressed]").nth(2);
await slot.waitFor();
await desk.evaluate(() => window.scrollTo(0, 0));
await desk.screenshot({ path: `${out}/04-book-time.png`, fullPage: true });
await slot.click();
await desk.getByLabel("Имя", { exact: true }).fill("Демо Клиент");
await desk.getByLabel("Телефон", { exact: true }).fill("+998 90 000 12 34");
await desk.getByRole("checkbox").check();
await desk.getByRole("button", { name: "Проверить запись" }).click();
await desk.getByRole("button", { name: "Подтвердить запись" }).waitFor();
await desk.evaluate(() => window.scrollTo(0, 0));
await desk.screenshot({ path: `${out}/05-book-review.png`, fullPage: true });
await desk.getByRole("button", { name: "Подтвердить запись" }).click();
await desk.getByRole("heading", { name: "Вы записаны" }).waitFor();
await desk.waitForTimeout(500); // let the entry animation finish
await desk.screenshot({ path: `${out}/06-success.png`, fullPage: true });
const link = await desk.getByLabel("Личная ссылка на запись").inputValue();
await desk.goto(link);
await desk.screenshot({ path: `${out}/07-private-pin.png` });
await desk.getByLabel("Последние 4 цифры телефона").fill("1234");
await desk.getByRole("button", { name: "Открыть запись" }).click();
await desk.getByRole("button", { name: "Перенести" }).click();
await desk.locator("#pick-time-h ~ div button[aria-pressed]").first().waitFor();
await desk.screenshot({ path: `${out}/08-private-reschedule.png`, fullPage: true });

const staff = await (await ctx(1440, 1000)).newPage();
await staff.goto(base + "/staff");
await staff.getByLabel("E-mail").fill("admin@demo.cutline");
await staff.getByLabel("Пароль").fill(process.env.DEMO_PASSWORD ?? "demo-cutline-2026");
await staff.getByRole("button", { name: "Войти" }).click();
await staff.waitForURL(/calendar/);
// Show a busy day: the day after tomorrow.
const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
await staff.goto(`${base}/staff/calendar?view=day&date=${d}`, { waitUntil: "networkidle" });
await staff.screenshot({ path: `${out}/09-staff-calendar-day.png`, fullPage: true });
const d3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
await staff.goto(`${base}/staff/calendar?view=week&date=${d3}`, { waitUntil: "networkidle" });
await staff.screenshot({ path: `${out}/10-staff-calendar-week.png`, fullPage: true });
await staff.goto(`${base}/staff/bookings`, { waitUntil: "networkidle" });
await staff.screenshot({ path: `${out}/11-staff-bookings.png` });

const phone = await (await ctx(390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
await phone.goto(base + "/", { waitUntil: "networkidle" });
await phone.screenshot({ path: `${out}/12-home-mobile.png` });
await phone.goto(base + "/book", { waitUntil: "networkidle" });
await phone.getByRole("button", { name: /^Оформление бороды/ }).tap();
await phone.getByRole("button", { name: /Любой мастер/ }).tap();
await phone.locator("#pick-time-h ~ div button[aria-pressed]").first().waitFor();
await phone.screenshot({ path: `${out}/13-book-mobile.png` });
const sp = await (await ctx(390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
await sp.goto(base + "/staff");
await sp.getByLabel("E-mail").fill("timur@demo.cutline");
await sp.getByLabel("Пароль").fill(process.env.DEMO_PASSWORD ?? "demo-cutline-2026");
await sp.getByRole("button", { name: "Войти" }).click();
await sp.waitForURL(/calendar/);
await sp.goto(`${base}/staff/calendar?view=week&date=${d3}`, { waitUntil: "networkidle" });
await sp.screenshot({ path: `${out}/14-staff-barber-mobile.png`, fullPage: true });
await browser.close();
console.log("screenshots written to", out);
