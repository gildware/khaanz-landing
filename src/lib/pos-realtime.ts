import { getPrisma } from "@/lib/prisma";

export type PosRealtimeEvent =
  | {
      type: "order";
      id: string;
      status: string;
      source: string;
      fulfillment?: string;
      totalMinor?: number;
      customerName?: string | null;
      customerPhone?: string;
      createdAt?: string;
    }
  | { type: "catalog" };

export const POS_REALTIME_CHANNEL = "khaanz_pos";

/** Fan-out to POS WebSocket / admin SSE listeners via Postgres NOTIFY. */
export async function publishPosRealtime(
  event: PosRealtimeEvent,
): Promise<void> {
  const payload = JSON.stringify(event);
  if (payload.length > 7000) {
    await notifyRaw(JSON.stringify({ type: event.type, id: "id" in event ? event.id : undefined }));
    return;
  }
  await notifyRaw(payload);
}

async function notifyRaw(payload: string): Promise<void> {
  try {
    await getPrisma().$executeRawUnsafe(
      "SELECT pg_notify('khaanz_pos', $1)",
      payload,
    );
  } catch (e) {
    console.error("pos realtime notify failed:", e);
  }
}
