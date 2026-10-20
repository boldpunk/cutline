import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      APP_SECRET: "test-secret-test-secret-test-secret-0123456789",
      SMTP_HOST: "",
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "postgres://cutline:cutline@localhost:5432/cutline_test",
    },
  },
});
