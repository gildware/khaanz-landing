import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

/**
 * Public order lookup by UUID or display ref (e.g. KH-200426001).
 */
export async function GET(_req: Request, context: RouteContext) {
  const { orderId: rawParam } = await context.params;
  const orderId = rawParam ? decodeURIComponent(rawParam) : "";
  if (!orderId || orderId.length < 6) {
    return Response.json({ error: "Invalid order id." }, { status: 400 });
  }

  try {
    const prisma = getPrisma();
    const order = isUuid(orderId)
      ? await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            lines: { orderBy: { sortIndex: "asc" } },
          },
        })
      : await prisma.order.findFirst({
          where: { orderRef: orderId },
          include: {
            lines: { orderBy: { sortIndex: "asc" } },
          },
        });

    if (!order) {
      return Response.json({ error: "Order not found." }, { status: 404 });
    }

    return Response.json({
      id: order.id,
      orderRef: order.orderRef,
      status: order.status,
      statusLabel: ORDER_STATUS_LABEL[order.status],
      fulfillment: order.fulfillment,
      scheduleMode: order.scheduleMode,
      scheduledAt: order.scheduledAt?.toISOString() ?? null,
      totalMinor: order.totalMinor,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      lines: order.lines.map((l) => ({
        sortIndex: l.sortIndex,
        payload: l.payload,
      })),
    });
  } catch (e) {
    console.error("GET /api/orders/[orderId] failed:", e);
    return Response.json(
      { error: "Order lookup is not available." },
      { status: 503 },
    );
  }
}
