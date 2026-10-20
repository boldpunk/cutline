// Creates a business (draft page) and its owner account in any database,
// including production. No demo data. Prints a one-time password unless
// OWNER_PASSWORD is set.
// Usage: npm run create-salon -- --slug morki --name "Morki Barber" --owner-email you@example.com \
//          [--owner-name "Имя"] [--instagram https://www.instagram.com/morki_barber/] [--owner-is-barber]
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { closeDb } from "@/lib/db/client";
import { registerSalon } from "@/lib/server/onboarding";
import { migrate } from "./migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      "owner-email": { type: "string" },
      "owner-name": { type: "string" },
      instagram: { type: "string" },
      "owner-is-barber": { type: "boolean", default: false },
    },
  });
  if (!values.slug || !values.name || !values["owner-email"]) {
    throw new Error('Pass --slug, --name and --owner-email (see the header of scripts/create-salon.ts)');
  }
  await migrate(url, () => {});
  const generated = !process.env.OWNER_PASSWORD;
  const password = process.env.OWNER_PASSWORD ?? randomBytes(9).toString("base64url");
  await registerSalon({
    businessName: values.name,
    slug: values.slug,
    ownerName: values["owner-name"] ?? values.name,
    email: values["owner-email"],
    password,
    instagramUrl: values.instagram ?? null,
    ownerIsBarber: values["owner-is-barber"] ?? false,
  });
  console.log(`Created draft page /${values.slug} for "${values.name}".`);
  console.log(`Owner login: ${values["owner-email"]}${generated ? ` / ${password}  (shown once — send it privately)` : ""}`);
  console.log("The owner fills in the page in /staff/setup and publishes it.");
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeDb();
    process.exit(1);
  });
