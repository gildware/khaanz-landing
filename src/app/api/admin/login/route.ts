import { NextResponse } from "next/server";

import {
  ADMIN_TOKEN_COOKIE,
  createAdminToken,
  verifyAdminPassword,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!verifyAdminPassword(body.password ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = await createAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
