import { cookies } from "next/headers";
import pg from "pg";
import type { NextRequest } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { POS_REALTIME_CHANNEL } from "@/lib/pos-realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let client: pg.Client | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      send(JSON.stringify({ type: "hello", ok: true }));

      const url = process.env.DATABASE_URL;
      if (!url) {
        send(JSON.stringify({ type: "error", error: "no_database" }));
        return;
      }

      try {
        client = new pg.Client({ connectionString: url });
        await client.connect();
        await client.query(`LISTEN ${POS_REALTIME_CHANNEL}`);
        client.on("notification", (msg) => {
          if (msg.channel !== POS_REALTIME_CHANNEL || !msg.payload) return;
          send(msg.payload);
        });
      } catch (e) {
        send(
          JSON.stringify({
            type: "error",
            error: e instanceof Error ? e.message : "listen_failed",
          }),
        );
      }
    },
    cancel() {
      closed = true;
      void client?.end().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
