import { buildSearchIndex } from "@/lib/server/search-index";
import { errorResponse } from "@/lib/server/web";

export const dynamic = "force-dynamic";

/** Public search index (services, barbers, salon info). No client data. */
export async function GET() {
  try {
    return Response.json(
      { docs: await buildSearchIndex() },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
