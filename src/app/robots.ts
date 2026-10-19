import type { MetadataRoute } from "next";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/staff", "/booking/", "/api/", "/*/search"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
