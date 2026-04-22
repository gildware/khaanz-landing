import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ vendors });
}

export async function POST(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 32) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 120) : "";
  const address =
    typeof body.address === "string" ? body.address.trim().slice(0, 4000) : "";

  let defaultCreditDays: number | null = null;
  if (body.defaultCreditDays !== undefined && body.defaultCreditDays !== null) {
    const n = Number(body.defaultCreditDays);
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      return NextResponse.json(
        { error: "defaultCreditDays must be 0–365 or null" },
        { status: 400 },
      );
    }
    defaultCreditDays = Math.floor(n);
  }

  const prisma = getPrisma();
  const vendor = await prisma.vendor.create({
    data: {
      name: name.slice(0, 200),
      phone,
      email,
      address,
      defaultCreditDays,
    },
  });

  return NextResponse.json(vendor);
}

