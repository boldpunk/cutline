// Runs before `npm start`. On Render (RENDER=true) or with SEED_SHOWCASE=1 it
// rebuilds the public demo salon; everywhere else it does nothing. A failure
// here is logged but never stops the site from starting.
export {};

if ((process.env.RENDER === "true" || process.env.SEED_SHOWCASE === "1") && process.env.DATABASE_URL) {
  const { migrate } = await import("./migrate");
  const { seedDemo } = await import("./seed-demo");
  const { closeDb } = await import("@/lib/db/client");
  try {
    await migrate(process.env.DATABASE_URL, () => {});
    await seedDemo({ reset: true, morki: false, log: (s) => s.startsWith("demo booking") || console.log(s) });
  } catch (err) {
    console.error("Demo showcase seed failed — starting the site anyway:", err);
  } finally {
    await closeDb();
  }
}
