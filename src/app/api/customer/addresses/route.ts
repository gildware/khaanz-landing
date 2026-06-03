import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyCustomerToken, CUSTOMER_TOKEN_COOKIE } from "@/lib/customer-auth";
import {
  toSavedAddressDTO,
  upsertCustomerAddress,
  type SavedAddressInput,
} from "@/lib/customer-address";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifyCustomerToken(
    cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const rows = await prisma.customerAddress.findMany({
    where: { customerId: session.customerId },
    orderBy: { lastUsedAt: "desc" },
  });

  return NextResponse.json({ addresses: rows.map(toSavedAddressDTO) });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyCustomerToken(
    cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SavedAddressInput;
  try {
    body = (await request.json()) as SavedAddressInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body?.address !== "string" || body.address.trim().length < 3) {
    return NextResponse.json(
      { error: "A valid address is required." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  await prisma.$transaction((tx) =>
    upsertCustomerAddress(tx, session.customerId, body),
  );

  const rows = await prisma.customerAddress.findMany({
    where: { customerId: session.customerId },
    orderBy: { lastUsedAt: "desc" },
  });

  return NextResponse.json({ ok: true, addresses: rows.map(toSavedAddressDTO) });
}
