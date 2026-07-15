import type { Prisma } from "@prisma/client";
import type {
  OrderEventAction,
  OrderEventActorType,
} from "@prisma/client";

import { getPrisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

export type RecordOrderEventInput = {
  orderId: string;
  action: OrderEventAction;
  actorType: OrderEventActorType;
  actorUserId?: string | null;
  /** Override label; otherwise resolved from user or actor type. */
  actorLabel?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
};

async function resolveActorLabel(
  db: DbClient,
  input: RecordOrderEventInput,
): Promise<string> {
  if (input.actorLabel?.trim()) return input.actorLabel.trim().slice(0, 160);
  if (input.actorUserId) {
    const user = await db.user.findUnique({
      where: { id: input.actorUserId },
      select: { displayName: true, email: true },
    });
    if (user) {
      return (user.displayName?.trim() || user.email).slice(0, 160);
    }
  }
  switch (input.actorType) {
    case "CUSTOMER":
      return "Customer";
    case "POS_SYNC":
      return "POS sync";
    case "SYSTEM":
      return "System";
    default:
      return "Staff";
  }
}

export async function recordOrderEvent(
  db: DbClient,
  input: RecordOrderEventInput,
): Promise<void> {
  const actorLabel = await resolveActorLabel(db, input);
  await db.orderEvent.create({
    data: {
      orderId: input.orderId,
      action: input.action,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorLabel,
      summary: input.summary.slice(0, 500),
      beforeJson:
        input.before === undefined
          ? undefined
          : (input.before as Prisma.InputJsonValue),
      afterJson:
        input.after === undefined
          ? undefined
          : (input.after as Prisma.InputJsonValue),
    },
  });
}

export function orderSnapshotForAudit(order: {
  status: string;
  totalMinor: number;
  deliveryChargeMinor: number;
  discountMinor: number;
  fulfillment: string;
  paymentMethod?: string;
  dineInTable?: string;
  notes?: string;
  address?: string;
  lineCount?: number;
}) {
  return {
    status: order.status,
    totalMinor: order.totalMinor,
    deliveryChargeMinor: order.deliveryChargeMinor,
    discountMinor: order.discountMinor,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod ?? "",
    dineInTable: order.dineInTable ?? "",
    notes: order.notes ?? "",
    address: order.address ?? "",
    lineCount: order.lineCount,
  };
}
