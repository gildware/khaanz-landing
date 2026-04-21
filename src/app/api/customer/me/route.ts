import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyCustomerToken, CUSTOMER_TOKEN_COOKIE } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value;
  const session = await verifyCustomerToken(token);
  if (!session) {
    return NextResponse.json({ loggedIn: false as const });
  }

  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
  });
  if (!customer || customer.phoneDigits !== session.phoneDigits) {
    return NextResponse.json({ loggedIn: false as const });
  }

  return NextResponse.json({
    loggedIn: true as const,
    customerId: customer.id,
    phoneDigits: customer.phoneDigits,
    displayName: customer.displayName,
  });
}
