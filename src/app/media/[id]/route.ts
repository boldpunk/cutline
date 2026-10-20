import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { media } from "@/lib/db/schema";

/** Serves uploaded photos (public by design: barber photos and the hero image). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [m] = await getDb().select().from(media).where(eq(media.id, id));
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.bytes), {
    headers: {
      "Content-Type": m.contentType,
      "Content-Length": String(m.size),
      // Media rows are immutable (a new upload gets a new id).
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
