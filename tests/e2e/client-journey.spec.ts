import { expect, test, type Page } from "@playwright/test";

async function bookFirstSlot(page: Page, opts: { barber: string; phone: string; name: string }) {
  await page.goto("/");
  await page.getByRole("link", { name: "Записаться" }).first().click();
  await expect(page).toHaveURL(/\/book/);
  await page.getByRole("button", { name: /^Мужская стрижка/ }).click();
  await page.getByRole("button", { name: new RegExp(opts.barber) }).click();
  // Pick a day a few days ahead so the visit is outside the 12 h change cutoff
  // (the pre-selected first day may be today, where cancelling is correctly refused).
  const freeDays = page.locator('[role=grid] button[aria-label*="есть время"]');
  await freeDays.first().waitFor();
  if ((await freeDays.count()) < 3) {
    await page.getByRole("button", { name: "Следующий месяц" }).click();
    await freeDays.first().waitFor();
  }
  const day = (await freeDays.count()) >= 3 ? freeDays.nth(2) : freeDays.first();
  const dayLabel = (await day.getAttribute("aria-label"))!.split(" — ")[0]!;
  await day.click();
  // Wait until the slots of that day (not the previously selected one) are shown.
  await expect(page.locator("#pick-time-h")).toContainText(dayLabel);
  await expect(page.getByText("Загружаем свободное время…")).toHaveCount(0);
  const firstSlot = page.locator("#pick-time-h ~ div button[aria-pressed]").first();
  await firstSlot.waitFor();
  const time = (await firstSlot.textContent())!.trim();
  await firstSlot.click();
  await page.getByLabel("Имя", { exact: true }).fill(opts.name);
  await page.getByLabel("Телефон", { exact: true }).fill(opts.phone);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Проверить запись" }).click();
  await expect(page.getByRole("heading", { name: /Проверка/ })).toBeVisible();
  return time;
}

test("A01: client books, opens the private link with PIN, cancels", async ({ page }) => {
  const time = await bookFirstSlot(page, { barber: "Тимур", phone: "+998 90 555 12 34", name: "Тест Клиент" });
  const review = page.locator("dl").first();
  await expect(review).toContainText("Тимур");
  await expect(review).toContainText("150 000");
  await expect(review).toContainText(time);
  await page.getByRole("button", { name: "Подтвердить запись" }).click();

  await expect(page).toHaveURL(/\/booking\/success$/);
  await expect(page.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  await expect(page.locator("dl")).toContainText(time);
  await expect(page.locator("dl")).toContainText("150 000");
  const link = await page.getByLabel("Личная ссылка на запись").inputValue();
  expect(link).toMatch(/\/booking\/[A-Za-z0-9_-]{43}$/);
  // No personal data or token in the success URL.
  expect(page.url()).not.toContain("1234");

  // Private page: nothing shown before verification.
  await page.goto(link);
  await expect(page.getByText("Тест Клиент")).toHaveCount(0);
  await page.getByLabel("Последние 4 цифры телефона").fill("0000");
  await page.getByRole("button", { name: "Открыть запись" }).click();
  await expect(page.locator("#last4-err")).toContainText("не совпадают");
  await page.getByLabel("Последние 4 цифры телефона").fill("1234");
  await page.getByRole("button", { name: "Открыть запись" }).click();
  await expect(page.getByText("Тест Клиент")).toBeVisible();
  await expect(page.getByText("+998 ••• ••• •• 34")).toBeVisible();

  await page.getByRole("button", { name: "Отменить запись" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await page.getByRole("button", { name: "Да, отменить" }).click();
  await expect(page.getByRole("heading", { name: "Запись отменена" })).toBeVisible();

  await page.goto(link);
  await expect(page.getByText("Отменена клиентом")).toBeVisible();
  await expect(page.getByRole("button", { name: "Перенести" })).toHaveCount(0);
});

test("browser Back keeps earlier choices", async ({ page }) => {
  await page.goto("/book");
  await page.getByRole("button", { name: /Оформление бороды/ }).click();
  await page.getByRole("button", { name: /Любой мастер/ }).click();
  await page.locator("#pick-time-h ~ div button[aria-pressed]").first().waitFor();
  await page.goBack();
  await expect(page.getByRole("button", { name: /Любой мастер/ })).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect(page.getByRole("button", { name: /Оформление бороды/ })).toHaveAttribute("aria-pressed", "true");
});
