// Fresh E2E database with the fictional demo salon.
import { execFileSync } from "node:child_process";
import postgres from "postgres";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_E2E ?? "postgres://cutline:cutline@localhost:5432/cutline_e2e";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; create schema public;");
  await sql.end();
  execFileSync("npx", ["tsx", "scripts/seed-demo.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789" },
  });
}
