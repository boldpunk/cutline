// Creates (or resets the password of) an admin account.
// Usage: npm run create-admin -- --salon morki --email owner@salon.uz --name "Имя"
// The password is read from ADMIN_PASSWORD or prompted (not echoed in logs).
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { findSalonBySlug } from "@/lib/server/settings";
import { audit } from "@/lib/server/audit";
import { PASSWORD_MIN_LENGTH, hashPassword } from "@/lib/server/passwords";
import { deleteUserSessions } from "@/lib/server/sessions";

async function main() {
  const { values } = parseArgs({ options: { salon: { type: "string" }, email: { type: "string" }, name: { type: "string" } } });
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Pass --email");
  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question(`Password for ${email} (min ${PASSWORD_MIN_LENGTH} chars): `);
    rl.close();
  }
  if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  const db = getDb();
  const salon = values.salon ? await findSalonBySlug(db, values.salon) : null;
  if (!salon) throw new Error("Pass --salon <address of an existing salon>");
  const hash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing && existing.salonId !== salon.id) throw new Error("This e-mail belongs to another salon");
  if (existing) {
    await db.update(users).set({ passwordHash: hash, role: "admin", active: true, updatedAt: new Date() }).where(eq(users.id, existing.id));
    await deleteUserSessions(existing.id);
    await audit(db, salon.id, null, "user.cli_reset_admin", "user", existing.id, { email });
    console.log(`Updated ${email}: role admin, new password set.`);
  } else {
    const [row] = await db.insert(users).values({ salonId: salon.id, email, name: values.name?.trim() || "Администратор", role: "admin", passwordHash: hash }).returning({ id: users.id });
    await audit(db, salon.id, null, "user.cli_create_admin", "user", row!.id, { email });
    console.log(`Created admin ${email}.`);
  }
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
