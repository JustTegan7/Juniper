import "server-only";
import { auditLog } from "@evergreen/db";

export type AuditActor = { workspaceId: string; userId: string | null; label: string };

/** Row for the audit log. Insert it in the same batch as the change it describes. */
export function auditRow(actor: AuditActor, entity: string, entityId: string, action: string, before?: unknown, after?: unknown) {
  return {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    actorLabel: actor.label,
    entity,
    entityId,
    action,
    before: before === undefined ? null : (before as object),
    after: after === undefined ? null : (after as object),
  } satisfies typeof auditLog.$inferInsert;
}
