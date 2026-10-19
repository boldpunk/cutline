import { DomainError } from "@/lib/server/errors";
import { getPublicSalon } from "@/lib/server/public-data";
import { buildSearchIndex } from "@/lib/server/search-index";
import { errorResponse } from "@/lib/server/web";

export const dynamic = "force-dynamic";

/** Public search index of one salon (services, barbers, salon info). No client data. */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("salon") ?? "";
    const salon = await getPublicSalon(slug);
    if (!salon) throw new DomainError("not_found", "Салон не найден.");
    return Response.json(
      { docs: await buildSearchIndex(salon) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
