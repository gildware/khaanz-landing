import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";
import { recordVendorPaymentInTransaction } from "@/lib/vendors/vendor-payment-flow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vendorId = typeof body.vendorId === "string" ? body.vendorId.trim() : "";
  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 });

  const amountPaise = Number(body.amountPaise);
  const method =
    typeof body.method === "string" ? body.method.trim().slice(0, 32) : "cash";
  const paidAt =
    typeof body.paidAt === "string" && body.paidAt ? new Date(body.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    return NextResponse.json({ error: "Invalid paidAt" }, { status: 400 });
  }
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction((tx) =>
      recordVendorPaymentInTransaction(tx, {
        vendorId,
        paidAt,
        amountPaise,
        method,
        reference,
        note,
        createdByUserId: session.userId,
      }),
    );
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

