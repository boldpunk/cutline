import { getDb } from "@/lib/db/client";
import { findSalonBySlug, slugProblem } from "@/lib/server/settings";
import { json } from "@/lib/server/web";

/** Is this page address free? Says nothing else about the salon. */
export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim().toLowerCase().slice(0, 60);
  const problem = slugProblem(slug);
  if (problem) return json({ available: false, problem });
  const taken = await findSalonBySlug(getDb(), slug);
  return json({ available: !taken, problem: taken ? "Этот адрес уже занят." : null });
}
