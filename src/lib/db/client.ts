import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
/** A database handle or an open transaction. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

type Cached = { sql: postgres.Sql; db: DB };
const g = globalThis as unknown as { __cutlineDb?: Cached };

function create(): Cached {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Keep Postgres NOTICEs (e.g. "extension exists") out of the logs.
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export function getDb(): DB {
  g.__cutlineDb ??= create();
  return g.__cutlineDb.db;
}

export function getSql(): postgres.Sql {
  g.__cutlineDb ??= create();
  return g.__cutlineDb.sql;
}

export async function closeDb(): Promise<void> {
  if (g.__cutlineDb) {
    await g.__cutlineDb.sql.end({ timeout: 5 });
    g.__cutlineDb = undefined;
  }
}
