import type { Tx } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  tx: Tx,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  meta?: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({ actorId, action, entity, entityId, meta: meta ?? null });
}
