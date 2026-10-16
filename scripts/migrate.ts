// Applies migrations/*.sql in name order, each in its own transaction.
// Safe to run concurrently (advisory lock) and repeatedly (schema_migrations).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

export async function migrate(databaseUrl: string, log = console.log): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const dir = path.resolve(import.meta.dirname, "..", "migrations");
  try {
    await sql`select pg_advisory_lock(7211, 1)`;
    await sql`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
    await sql`select pg_advisory_unlock(7211, 1)`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  migrate(url)
    .then(() => console.log("migrations up to date"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
