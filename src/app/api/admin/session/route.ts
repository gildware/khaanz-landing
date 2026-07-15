import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ADMIN_TOKEN_COOKIE,
  createAdminToken,
  verifyAdminToken,
} from "@/lib/admin-auth";
import {
  ALL_ADMIN_PERMISSIONS,
  parsePermissionsJson,
} from "@/lib/admin-permissions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      active: true,
      permissions: true,
    },
  });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    user.role !== "SUPER_ADMIN" &&
    user.role !== "ADMIN" &&
    user.role !== "STAFF"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions =
    user.role === "SUPER_ADMIN"
      ? ALL_ADMIN_PERMISSIONS
      : parsePermissionsJson(user.permissions);

  // Refresh JWT so middleware sees latest permissions without re-login.
  const token = await createAdminToken(user.id, user.role, permissions);
  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
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
