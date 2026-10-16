import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
import { env } from "@/lib/server/env";

/** Public pages only — never staff, private booking links or API. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/services", "/team", "/book", "/privacy"].map((p) => ({ url: `${env.appUrl}${p}`, changeFrequency: "weekly" }));
}
