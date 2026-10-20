import type { Executor } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export async function audit(
  ex: Executor,
  salonId: string | null,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
): Promise<void> {
  await ex.insert(auditLog).values({ salonId, actorUserId, action, entityType, entityId, data });
}
