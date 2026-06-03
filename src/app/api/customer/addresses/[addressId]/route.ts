import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyCustomerToken, CUSTOMER_TOKEN_COOKIE } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ addressId: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyCustomerToken(
    cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { addressId } = await params;
  const prisma = getPrisma();
  await prisma.customerAddress.deleteMany({
    where: { id: addressId, customerId: session.customerId },
  });

  return NextResponse.json({ ok: true });
}
