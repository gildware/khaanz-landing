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

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminPermission("staff");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (existing.role === "SUPER_ADMIN" && auth.session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    displayName?: unknown;
    role?: unknown;
    permissions?: unknown;
    active?: unknown;
    password?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: {
    displayName?: string | null;
    role?: AdminRole;
    permissions?: string[];
    active?: boolean;
    passwordHash?: string;
  } = {};

  if (typeof body.displayName === "string") {
    data.displayName = body.displayName.trim() || null;
  }

  if (body.active === true || body.active === false) {
    if (existing.id === auth.session.userId && body.active === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 },
      );
    }
    if (existing.role === "SUPER_ADMIN" && body.active === false) {
      return NextResponse.json(
        { error: "Cannot deactivate the super admin." },
        { status: 400 },
      );
    }
    data.active = body.active;
  }

  if (typeof body.password === "string" && body.password.trim().length > 0) {
    const password = body.password.trim();
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  if (existing.role !== "SUPER_ADMIN" && typeof body.role === "string") {
    if (body.role === "ADMIN" || body.role === "STAFF") {
      data.role = body.role;
    }
  }

  if (existing.role !== "SUPER_ADMIN" && body.permissions !== undefined) {
    let permissions = normalizePermissionsInput(body.permissions);
    const nextRole = data.role ?? (existing.role as AdminRole);
    if (nextRole === "ADMIN" && permissions.length === 0) {
      permissions = [...ALL_ADMIN_PERMISSIONS];
    }
    if (auth.session.role !== "SUPER_ADMIN") {
      permissions = permissions.filter((p) => p !== "staff");
    }
    data.permissions = permissions;
  }

  const user = await prisma.user.update({
    where: { id },
    data,
  });

  return NextResponse.json({ user: toPublicUser(user) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminPermission("staff");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  if (id === auth.session.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (existing.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Cannot delete the super admin." },
      { status: 400 },
    );
  }

  // Soft-delete: deactivate so order event FKs remain valid.
  const user = await prisma.user.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ user: toPublicUser(user) });
}
