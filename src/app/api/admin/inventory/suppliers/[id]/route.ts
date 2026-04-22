import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim().slice(0, 200);
  }
  if (typeof body.phone === "string") data.phone = body.phone.trim().slice(0, 32);
  if (typeof body.email === "string") data.email = body.email.trim().slice(0, 120);
  if (typeof body.address === "string") {
    data.address = body.address.trim().slice(0, 4000);
  }
  if (body.defaultCreditDays === null) {
    data.defaultCreditDays = null;
  } else if (typeof body.defaultCreditDays === "number") {
    const n = Math.floor(body.defaultCreditDays);
    if (n < 0 || n > 365) {
      return NextResponse.json({ error: "Invalid credit days" }, { status: 400 });
    }
    data.defaultCreditDays = n;
  }
  if (typeof body.active === "boolean") data.active = body.active;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    const row = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
