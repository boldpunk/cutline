import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { salons } from "@/lib/db/schema";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Public pages of published, real (non-demo) salons — never staff, private links or API. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const live = await getDb()
    .select({ slug: salons.slug, updatedAt: salons.updatedAt })
    .from(salons)
    .where(and(eq(salons.published, true), eq(salons.mode, "live")));
  return [
    { url: `${env.appUrl}/`, changeFrequency: "weekly" },
    { url: `${env.appUrl}/start`, changeFrequency: "monthly" },
    ...live.flatMap((s) =>
      ["", "/services", "/team", "/book"].map((p) => ({ url: `${env.appUrl}/${s.slug}${p}`, lastModified: s.updatedAt, changeFrequency: "weekly" as const })),
    ),
  ];
}
