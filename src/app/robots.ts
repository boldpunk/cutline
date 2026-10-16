import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";
import { env } from "@/lib/server/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/staff", "/booking/", "/api/", "/book?"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
