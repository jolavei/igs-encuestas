import { prisma } from "@/lib/prisma";
import { toJson } from "@/lib/enums";

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  metadata?: unknown
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      metadata: toJson(metadata),
    },
  });
}
