import { NextResponse } from "next/server";

import { CUSTOMER_TOKEN_COOKIE } from "@/lib/customer-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CUSTOMER_TOKEN_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
