import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const GENERIC_ACTOR_LABELS = new Set([
  "pos sync",
  "system",
  "customer",
  "staff",
]);

function normalizeCreatorLabel(raw: string | null | undefined): string | null {
  const label = (raw ?? "").trim();
  if (!label) return null;
  if (GENERIC_ACTOR_LABELS.has(label.toLowerCase())) return null;
  return label.slice(0, 160);
}

/** Resolve desktop/web POS creator from sync/create body fields. */
export async function resolvePosSyncCreator(
  db: DbClient,
  body: Record<string, unknown>,
): Promise<{ userId: string | null; label: string | null }> {
  const rawId =
    typeof body.createdByUserId === "string" ? body.createdByUserId.trim() : "";
  const rawLabel = normalizeCreatorLabel(
    typeof body.createdByLabel === "string" ? body.createdByLabel : "",
  );

  if (rawId) {
    const user = await db.user.findUnique({
      where: { id: rawId },
      select: { id: true, displayName: true, email: true },
    });
    if (user) {
      return {
        userId: user.id,
        label:
          normalizeCreatorLabel(user.displayName) ||
          normalizeCreatorLabel(user.email) ||
          rawLabel ||
          "Staff",
      };
    }
  }

  if (rawLabel) {
    const matches = await db.user.findMany({
      where: { displayName: rawLabel },
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) {
      return { userId: matches[0]!.id, label: rawLabel };
    }
    return { userId: null, label: rawLabel };
  }

  return { userId: null, label: null };
}

/**
 * Build orderId → display label for "Taken by".
 * Prefers linked user; falls back to CREATED event actorLabel.
 */
export async function mapOrderCreatedByLabels(
  db: DbClient,
  orders: Array<{ id: string; createdByUserId: string | null }>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (orders.length === 0) return out;

  const creatorIds = [
    ...new Set(
      orders
        .map((o) => o.createdByUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const creators =
    creatorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
  const creatorLabelById = new Map(
    creators.map((u) => [
      u.id,
      normalizeCreatorLabel(u.displayName) ||
        normalizeCreatorLabel(u.email) ||
        "Staff",
    ]),
  );

  const needsEventFallback = orders.filter(
    (o) =>
      !o.createdByUserId ||
      !creatorLabelById.has(o.createdByUserId),
  );
  const eventLabelByOrderId = new Map<string, string>();
  if (needsEventFallback.length > 0) {
    const events = await db.orderEvent.findMany({
      where: {
        orderId: { in: needsEventFallback.map((o) => o.id) },
        action: "CREATED",
      },
      select: { orderId: true, actorLabel: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    for (const e of events) {
      if (eventLabelByOrderId.has(e.orderId)) continue;
      const label = normalizeCreatorLabel(e.actorLabel);
      if (label) eventLabelByOrderId.set(e.orderId, label);
    }
  }

  for (const o of orders) {
    if (o.createdByUserId && creatorLabelById.has(o.createdByUserId)) {
      out.set(o.id, creatorLabelById.get(o.createdByUserId) ?? null);
      continue;
    }
    out.set(o.id, eventLabelByOrderId.get(o.id) ?? null);
  }

  return out;
}
