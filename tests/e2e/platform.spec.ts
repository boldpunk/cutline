import { expect, test } from "@playwright/test";

test("a business opens its own page: signup → draft (hidden) → setup checklist", async ({ page, browser }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.goto("/");
  await page.getByRole("link", { name: "Открыть свою страницу" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await page.getByLabel("Название барбершопа").fill("Барбершоп Тест");
  // The address is suggested from the name.
  await expect(page.getByLabel("Адрес вашей страницы")).toHaveValue("barbershop-test");
  await page.getByLabel("Адрес вашей страницы").fill(slug);
  await expect(page.getByText("Адрес свободен ✓")).toBeVisible();
  await page.getByLabel("Ваше имя").fill("Владелец");
  await page.getByLabel("E-mail для входа").fill(`${slug}@example.com`);
  await page.getByLabel("Пароль").fill("e2e-password-123");
  await page.getByLabel(/Я представляю этот бизнес/).check();
  await page.getByRole("button", { name: "Создать страницу" }).click();

  await expect(page).toHaveURL(/\/staff\/setup$/);
  await expect(page.getByRole("heading", { name: "Барбершоп Тест" })).toBeVisible();
  await expect(page.getByText("0 из 5")).toBeVisible();
  await expect(page.getByRole("button", { name: "Опубликовать страницу" })).toBeDisabled();

  // The owner sees a draft preview; everyone else gets 404.
  await page.goto(`/${slug}`);
  await expect(page.getByText("Черновик: страницу видите только вы.")).toBeVisible();
  const anon = await browser.newPage();
  const res = await anon.goto(`/${slug}`);
  expect(res?.status()).toBe(404);
  await anon.close();

  // Taken and reserved addresses are refused live.
  await page.goto("/");
  await page.context().clearCookies();
  await page.goto("/start");
  await page.getByLabel("Адрес вашей страницы").fill(slug);
  await expect(page.getByText("Этот адрес уже занят.")).toBeVisible();
  await page.getByLabel("Адрес вашей страницы").fill("demo");
  await expect(page.getByText(/зарезервирован/)).toBeVisible();
});

test("platform home lists published pages but not drafts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /CUTLINE.*\/demo/ })).toBeVisible();
  await expect(page.getByText("Morki Barber")).toHaveCount(0);
});

test("demo tour: salon page shows works and amenities; one-click demo cabinet", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Работы" })).toBeVisible();
  await expect(page.getByText("Кофе и чай")).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Войти как администратор" }).click();
  await expect(page).toHaveURL(/\/staff\/calendar$/);
  await page.getByRole("link", { name: "Работы" }).click();
  await expect(page.getByRole("heading", { name: "Работы" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Удалить/ }).first()).toBeVisible();
});
