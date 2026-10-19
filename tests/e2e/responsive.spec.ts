import { expect, test } from "@playwright/test";

const WIDTHS = [360, 390, 768, 1024, 1440];
const PAGES = ["/", "/start", "/demo", "/demo/services", "/demo/team", "/demo/book", "/demo/privacy", "/staff"];

test("A12: no horizontal scroll on public pages at 360–1440px", async ({ browser }) => {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    for (const path of PAGES) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} @ ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.close();
  }
});

test("A12 @mobile: full booking on a touch phone without hover", async ({ page }) => {
  await page.goto("/demo/book");
  await page.getByRole("button", { name: /^Стрижка машинкой/ }).tap();
  await page.getByRole("button", { name: /Любой мастер/ }).tap();
  const slot = page.locator("#pick-time-h ~ div button[aria-pressed]").first();
  await slot.waitFor();
  await slot.tap();
  await page.getByLabel("Имя", { exact: true }).fill("Мобильный");
  await page.getByLabel("Телефон", { exact: true }).fill("+998 90 222 33 44");
  await page.getByRole("checkbox").tap();
  await page.getByRole("button", { name: "Проверить запись" }).tap();
  // Nothing fixed covers the confirm button.
  const confirm = page.getByRole("button", { name: "Подтвердить запись" });
  await confirm.scrollIntoViewIfNeeded();
  const box = (await confirm.boundingBox())!;
  const topEl = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.textContent ?? "", [box.x + box.width / 2, box.y + box.height / 2]);
  expect(topEl).toContain("Подтвердить");
  await confirm.tap();
  await expect(page.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
