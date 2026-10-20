"use server";
import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/server/action-result";
import { setPublished } from "@/lib/server/onboarding";
import { requireAdmin } from "@/lib/server/staff-auth";

export async function publishAction(published: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    await setPublished(user.salonId, user.id, published);
    revalidatePath("/", "layout");
    return { ok: true, message: published ? "Страница опубликована." : "Страница снята с публикации." };
  });
}
