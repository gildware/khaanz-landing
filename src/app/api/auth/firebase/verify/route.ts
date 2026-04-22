import { NextResponse } from "next/server";

import {
  createCustomerToken,
  CUSTOMER_TOKEN_COOKIE,
} from "@/lib/customer-auth";
import { getFirebaseAdminAuth } from "@/lib/firebase-admin";
import { getPrisma } from "@/lib/prisma";
import {
  normalizeIndianMobileDigits,
  isIndianMobile10,
} from "@/lib/phone-digits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { idToken?: string };
  try {
    body = (await request.json()) as { idToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
  }

  let decoded: { phone_number?: string; uid?: string };
  try {
    const r = await getFirebaseAdminAuth().verifyIdToken(idToken);
    decoded = { phone_number: r.phone_number, uid: r.uid };
  } catch {
    return NextResponse.json({ error: "Invalid Firebase token." }, { status: 401 });
  }

  const phone = typeof decoded.phone_number === "string" ? decoded.phone_number : "";
  // Expect E.164 for phone auth. We map it to the existing 10-digit Indian model.
  const digits = normalizeIndianMobileDigits(phone);
  if (!isIndianMobile10(digits)) {
    return NextResponse.json(
      { error: "Phone number must be a valid Indian mobile number." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const customer = await prisma.customer.upsert({
    where: { phoneDigits: digits },
    create: { phoneDigits: digits },
    update: {},
  });

  const token = await createCustomerToken(customer.id, customer.phoneDigits);
  const res = NextResponse.json({ ok: true, customerId: customer.id });
  res.cookies.set(CUSTOMER_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

