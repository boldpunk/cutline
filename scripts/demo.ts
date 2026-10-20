// Local demo without Docker: `npm run demo`.
// Starts a bundled PostgreSQL (embedded-postgres) in ./.demo-db, applies
// migrations, seeds the fictional demo salon and runs the site.
// Needs only Node.js ≥ 22. Data persists between runs; delete .demo-db to reset.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const root = path.resolve(import.meta.dirname, "..");
// initdb refuses to run as root and switches user; keep the data in /tmp then.
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const dataDir = process.env.DEMO_DB_DIR ?? (isRoot ? path.join(os.tmpdir(), "cutline-demo-db") : path.join(root, ".demo-db"));
const dbPort = Number(process.env.DEMO_DB_PORT ?? 54329);
const appPort = Number(process.env.PORT ?? 3000);

async function main() {
  mkdirSync(path.dirname(dataDir), { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "cutline",
    password: "cutline",
    port: dbPort,
    persistent: true,
    onLog: () => {},
  });
  const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) {
    console.log("Готовим встроенную базу данных (только при первом запуске)…");
    await pg.initialise();
  }
  await pg.start();
  if (fresh) await pg.createDatabase("cutline");

  const secretFile = path.join(dataDir, "..", ".cutline-demo-secret");
  let secret = existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : "";
  if (secret.length < 32) {
    secret = randomBytes(32).toString("hex");
    writeFileSync(secretFile, secret);
  }

  const env = {
    ...process.env,
    DATABASE_URL: `postgres://cutline:cutline@localhost:${dbPort}/cutline`,
    APP_URL: `http://localhost:${appPort}`,
    APP_SECRET: secret,
    COOKIE_SECURE: "false",
    SMTP_HOST: "",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  Object.assign(process.env, env);

  const { migrate } = await import("./migrate");
  const { seedDemo } = await import("./seed-demo");
  const { closeDb } = await import("@/lib/db/client");
  await migrate(env.DATABASE_URL, () => {});
  await seedDemo({ log: (s) => s.startsWith("demo booking") || console.log(s) });
  await closeDb();

  console.log(`\nЗапускаем сайт… (первое открытие каждой страницы компилируется несколько секунд)\n`);
  const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", String(appPort)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let announced = false;
  next.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (!announced && /Ready|ready/.test(text)) {
      announced = true;
      console.log(`
  Платформа:     http://localhost:${appPort}
  Новый бизнес:  http://localhost:${appPort}/start
  Демо-салон:    http://localhost:${appPort}/demo
  Morki Barber:  http://localhost:${appPort}/morki  (черновик — виден только после входа)
  Кабинет:       http://localhost:${appPort}/staff
                 admin@demo.cutline / demo-cutline-2026  (администратор демо)
                 timur@demo.cutline / demo-cutline-2026  (мастер демо)
                 morki@demo.cutline / demo-cutline-2026  (владелец Morki)

  Остановить: Ctrl+C. Данные лежат в ${dataDir} (удалите папку, чтобы начать заново).
`);
    }
  });

  const shutdown = async () => {
    next.kill("SIGTERM");
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  next.on("exit", async (code) => {
    await pg.stop().catch(() => {});
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  if (String(err).includes("EADDRINUSE") || String(err).includes("could not bind")) {
    console.error(`Порт ${dbPort} занят. Запустите с другим: DEMO_DB_PORT=54330 npm run demo`);
  }
  process.exit(1);
});
