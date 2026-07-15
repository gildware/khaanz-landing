import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import type { AdminRole } from "@/lib/admin-auth";
import {
  ALL_ADMIN_PERMISSIONS,
  normalizePermissionsInput,
  parsePermissionsJson,
} from "@/lib/admin-permissions";
import { requireAdminPermission } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

function toPublicUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  active: boolean;
  permissions: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    permissions:
      user.role === "SUPER_ADMIN"
        ? ALL_ADMIN_PERMISSIONS
        : parsePermissionsJson(user.permissions),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAdminPermission("staff");
  if (!auth.ok) return auth.response;

  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      active: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ users: users.map(toPublicUser) });
}

export async function POST(request: Request) {
  const auth = await requireAdminPermission("staff");
  if (!auth.ok) return auth.response;

  // Only SUPER_ADMIN (or anyone with staff + existing SUPER_ADMIN) can create users.
  // Staff permission is enough; creating SUPER_ADMIN is blocked below.

  let body: {
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
    role?: unknown;
    permissions?: unknown;
    active?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password =
    typeof body.password === "string" ? body.password.trim() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const roleRaw = typeof body.role === "string" ? body.role : "STAFF";
  const role: AdminRole =
    roleRaw === "ADMIN" || roleRaw === "STAFF" ? roleRaw : "STAFF";
  if (roleRaw === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Cannot create another super admin from this screen." },
      { status: 400 },
    );
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  let permissions = normalizePermissionsInput(body.permissions);
  if (role === "ADMIN" && permissions.length === 0) {
    permissions = [...ALL_ADMIN_PERMISSIONS];
  }
  // Staff managers cannot grant the staff permission unless they are SUPER_ADMIN
  if (auth.session.role !== "SUPER_ADMIN") {
    permissions = permissions.filter((p) => p !== "staff");
  }

  const active = body.active === false ? false : true;
  const passwordHash = await bcrypt.hash(password, 12);
  const prisma = getPrisma();

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: displayName || null,
        role,
        active,
        permissions,
      },
    });
    return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }
    throw e;
  }
}
