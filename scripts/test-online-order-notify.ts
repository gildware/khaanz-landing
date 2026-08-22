import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (process.env[key] === undefined) process.env[key] = val;
}

const ORIGIN = "http://127.0.0.1:3000";
const SYNC_KEY = process.env.POS_SYNC_KEY || "khaanz-pos-sync-dev";
const TEST_PHONE = "0000000099";

function detectNewPending(
  seeded: boolean,
  seen: Set<string>,
  pendingIds: string[],
): { seeded: true; newIds: string[] } {
  if (!seeded) {
    for (const id of pendingIds) seen.add(id);
    return { seeded: true, newIds: [] };
  }
  const newIds = pendingIds.filter((id) => !seen.has(id));
  for (const id of pendingIds) seen.add(id);
  return { seeded: true, newIds };
}

async function fetchPending() {
  const res = await fetch(`${ORIGIN}/api/pos-sync/orders?view=online_pending&limit=50`, {
    headers: { "x-pos-sync-key": SYNC_KEY, "x-pos-device-id": "notify-self-test" },
  });
  const json = (await res.json()) as {
    ok?: boolean;
    view?: string;
    orders?: Array<{ id: string; status: string; source?: string }>;
    error?: string;
  };
  return { status: res.status, json };
}

async function main() {
  const seen = new Set<string>();
  let seeded = false;
  const r1 = detectNewPending(seeded, seen, ["a", "b"]);
  seeded = r1.seeded;
  assert.deepEqual(r1.newIds, [], "first poll must seed, not alert");
  const r2 = detectNewPending(seeded, seen, ["a", "b", "c"]);
  assert.deepEqual(r2.newIds, ["c"], "second poll must alert only the new id");
  console.log("PASS poller seed/new-id logic");

  const unauth = await fetch(`${ORIGIN}/api/pos-sync/orders?view=online_pending`);
  assert.equal(unauth.status, 401, "missing sync key must 401");
  console.log("PASS unauthorized pos-sync pending");

  const first = await fetchPending();
  assert.equal(first.status, 200, `pending list HTTP ${first.status} ${first.json.error ?? ""}`);
  assert.equal(first.json.view, "online_pending", "server must advertise online_pending view");
  assert.ok(Array.isArray(first.json.orders), "orders array");
  const beforeIds = new Set((first.json.orders ?? []).map((o) => o.id));
  console.log(`PASS lite endpoint (pending count ${beforeIds.size})`);

  const prisma = new PrismaClient();
  const orderId = randomUUID();
  try {
    const customer = await prisma.customer.upsert({
      where: { phoneDigits: TEST_PHONE },
      create: { phoneDigits: TEST_PHONE, displayName: "Notify self-test" },
      update: { displayName: "Notify self-test" },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        orderRef: `TEST-NOTIFY-${orderId.slice(0, 8)}`,
        customerId: customer.id,
        status: "PENDING",
        fulfillment: "pickup",
        scheduleMode: "asap",
        notes: "NOTIFY_SELF_TEST",
        totalMinor: 100,
        source: "website",
      },
    });

    const second = await fetchPending();
    assert.equal(second.status, 200);
    const afterIds = (second.json.orders ?? []).map((o) => o.id);
    assert.ok(afterIds.includes(orderId), "new website PENDING order must appear in online_pending");
    const row = (second.json.orders ?? []).find((o) => o.id === orderId);
    assert.equal(row?.status, "PENDING");
    assert.equal(row?.source, "website");

    seeded = false;
    seen.clear();
    const seedPoll = detectNewPending(seeded, seen, [...beforeIds]);
    seeded = seedPoll.seeded;
    const alertPoll = detectNewPending(seeded, seen, afterIds);
    assert.ok(alertPoll.newIds.includes(orderId), "desktop poller would ring for the new order");
    console.log("PASS new pending website order is visible to desktop poller");
  } finally {
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.$disconnect();
  }

  const third = await fetchPending();
  assert.ok(!(third.json.orders ?? []).some((o) => o.id === orderId), "test order cleaned up");
  console.log("PASS cleanup");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
