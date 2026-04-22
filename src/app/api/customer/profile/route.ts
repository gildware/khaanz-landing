import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyCustomerToken, CUSTOMER_TOKEN_COOKIE } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value;
  const session = await verifyCustomerToken(token);
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { displayName?: string };
  try {
    body = (await request.json()) as { displayName?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 2) {
    return NextResponse.json(
      { error: "Name is too short." },
      { status: 400 },
    );
  }
  if (displayName.length > 80) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
  });
  if (!customer || customer.phoneDigits !== session.phoneDigits) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { displayName },
    select: { id: true, phoneDigits: true, displayName: true },
  });

  return NextResponse.json({
    ok: true as const,
    customerId: updated.id,
    phoneDigits: updated.phoneDigits,
    displayName: updated.displayName,
  });
}

