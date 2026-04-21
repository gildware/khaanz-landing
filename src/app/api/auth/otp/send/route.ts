import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isIndianMobile10,
  normalizeIndianMobileDigits,
} from "@/lib/phone-digits";
import { sendWhatsAppCloudText, isWhatsAppCloudConfigured } from "@/lib/whatsapp-cloud";

export const runtime = "nodejs";

const OTP_TTL_MS = 10 * 60 * 1000;
const SEND_COOLDOWN_MS = 45 * 1000;
const OTP_LENGTH = 6;

function randomOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(OTP_LENGTH, "0");
}

export async function POST(request: Request) {
  let body: { phone?: string };
  try {
    body = (await request.json()) as { phone?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  const digits = normalizeIndianMobileDigits(raw);
  if (!isIndianMobile10(digits)) {
    return NextResponse.json(
      { error: "Enter a valid 10-digit Indian mobile number." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const now = new Date();
  const cooldownSince = new Date(now.getTime() - SEND_COOLDOWN_MS);

  await prisma.otpChallenge.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const recent = await prisma.otpChallenge.findFirst({
    where: {
      phoneDigits: digits,
      createdAt: { gte: cooldownSince },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json(
      { error: "Please wait before requesting another code." },
      { status: 429 },
    );
  }

  const code = randomOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.otpChallenge.create({
    data: {
      phoneDigits: digits,
      codeHash,
      expiresAt,
    },
  });

  const devReturn =
    process.env.NODE_ENV === "development" ||
    process.env.OTP_RETURN_IN_RESPONSE === "1";
  // Never return OTP in JSON in production builds unless explicitly forced for debugging.
  const allowDevOtpInBody =
    devReturn && process.env.NODE_ENV !== "production";

  if (isWhatsAppCloudConfigured()) {
    const r = await sendWhatsAppCloudText({
      toDigits: `91${digits}`,
      body: `Your Khaanz login code is *${code}*. It expires in 10 minutes. Do not share this code.`,
    });
    if (!r.ok) {
      await prisma.otpChallenge.deleteMany({ where: { phoneDigits: digits } });
      return NextResponse.json(
        { error: "Could not send WhatsApp. Try again later." },
        { status: 503 },
      );
    }
  } else if (!devReturn) {
    await prisma.otpChallenge.deleteMany({ where: { phoneDigits: digits } });
    return NextResponse.json(
      {
        error:
          "OTP delivery is not configured. Set WhatsApp Cloud credentials, or run in development.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...(allowDevOtpInBody ? { devOtp: code } : {}),
  });
}
