import { expect, test } from "@playwright/test";

test("search: Ctrl+K, wrong keyboard layout, keyboard navigation to booking", async ({ page }) => {
  await page.goto("/services", { waitUntil: "networkidle" }); // shortcut listener attaches after hydration
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox", { name: /Поиск/ });
  await expect(box).toBeFocused();
  await box.fill("cnhb;rf"); // "стрижка" typed on the English layout
  await expect(page.getByText("Похоже, включена английская раскладка")).toBeVisible();
  const options = page.getByRole("option");
  await expect(options.first()).toContainText("стрижка", { ignoreCase: true });
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await box.press("ArrowUp");
  const title = (await options.first().locator(".font-medium").textContent())!.trim();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/book\?service=[0-9a-f-]{36}&step=barber/);
  await expect(page.getByText(`Услуга: ${title}`)).toBeVisible();
});

test("search: '/' opens, Escape closes and returns focus; header button opens; typos and translit", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Поиск по сайту" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Популярное")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const btn = page.getByRole("link", { name: /Поиск/ }).first();
  await btn.click();
  await expect(dialog).toBeVisible();
  const box = page.getByRole("combobox", { name: /Поиск/ });
  await box.fill("барода"); // typo
  await expect(page.getByRole("option").first()).toContainText("бород", { ignoreCase: true });
  await box.fill("timur"); // Latin
  await expect(page.getByRole("option").first()).toContainText("Тимур");
  await box.fill("отменить");
  await expect(page.getByRole("option").first()).toContainText("Перенос и отмена записи");
  await box.fill("маникюр");
  await expect(dialog.getByText("Ничего не нашли по «маникюр»")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(btn).toBeFocused();
});

test("search works without JavaScript and never exposes client data", async ({ browser, request }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/search?q=борода");
  await expect(page.getByRole("heading", { name: "Услуги" })).toBeVisible();
  await expect(page.locator("main li").first()).toContainText("бород", { ignoreCase: true });
  await ctx.close();
  const index = await (await request.get("/api/public/search-index")).text();
  expect(index).not.toMatch(/Демо-клиент|\+998|@demo/);
});

test("search @mobile: tap the header button and pick a result", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Поиск/ }).first().tap();
  const box = page.getByRole("combobox", { name: /Поиск/ });
  await box.fill("адрес");
  await page.getByRole("option").first().tap();
  await expect(page).toHaveURL(/\/#contacts$/);
});
