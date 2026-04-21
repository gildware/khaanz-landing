import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  createCustomerToken,
  CUSTOMER_TOKEN_COOKIE,
} from "@/lib/customer-auth";
import { getPrisma } from "@/lib/prisma";
import {
  isIndianMobile10,
  normalizeIndianMobileDigits,
} from "@/lib/phone-digits";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 8;

export async function POST(request: Request) {
  let body: { phone?: string; code?: string };
  try {
    body = (await request.json()) as { phone?: string; code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const digits = normalizeIndianMobileDigits(raw);
  if (!isIndianMobile10(digits)) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }

  const prisma = getPrisma();
  const now = new Date();

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phoneDigits: digits, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Invalid or expired code. Request a new one." },
      { status: 401 },
    );
  }

  const ok = await bcrypt.compare(code, challenge.codeHash);
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { attempts: { increment: 1 } },
  });

  if (!ok) {
    return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
  }

  await prisma.otpChallenge.deleteMany({ where: { phoneDigits: digits } });

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
