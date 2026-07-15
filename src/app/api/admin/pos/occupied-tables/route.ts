import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { listOccupiedDineInTables } from "@/lib/pos-occupied-tables";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Tables currently occupied by open dine-in POS orders. */
export async function GET() {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tables = await listOccupiedDineInTables(getPrisma());
  return NextResponse.json({ tables });
}
