import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  ADMIN_TOKEN_COOKIE,
  createAdminToken,
  type AdminRole,
} from "@/lib/admin-auth";
import {
  ALL_ADMIN_PERMISSIONS,
  parsePermissionsJson,
} from "@/lib/admin-permissions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const role: AdminRole =
    user.role === "SUPER_ADMIN"
      ? "SUPER_ADMIN"
      : user.role === "STAFF"
        ? "STAFF"
        : "ADMIN";
  const permissions =
    role === "SUPER_ADMIN"
      ? ALL_ADMIN_PERMISSIONS
      : parsePermissionsJson(user.permissions);

  const token = await createAdminToken(user.id, role, permissions);

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role,
      permissions,
    },
  });
  res.cookies.set(ADMIN_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
