import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.DATABASE_URL_E2E ?? "postgres://cutline:cutline@localhost:5432/cutline_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Asia/Tashkent",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } }, grep: /@mobile/ },
  ],
  webServer: {
    command: process.env.E2E_SERVER_CMD ?? `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: DB,
      APP_URL: `http://localhost:${PORT}`,
      APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      COOKIE_SECURE: "false",
      SMTP_HOST: "",
    },
  },
});
