import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ADMIN_TOKEN_COOKIE,
  type AdminSession,
  verifyAdminToken,
} from "@/lib/admin-auth";
import {
  ALL_ADMIN_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  parsePermissionsJson,
  type AdminPermission,
  type PermissionBearer,
} from "@/lib/admin-permissions";
import { getPrisma } from "@/lib/prisma";

export type AdminSessionUser = AdminSession & {
  email: string;
  displayName: string | null;
  active: boolean;
};

/** Mirrors the `/api/admin/session` payload consumed by `AdminSessionProvider`. */
export type AdminClientSessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  permissions: AdminPermission[];
};

/** Cookie JWT only — no DB round-trip. Prefer `loadAdminSession` for APIs. */
export async function requireAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_TOKEN_COOKIE)?.value);
}

/** Fresh permissions from DB (revocations apply immediately). */
export async function loadAdminSession(): Promise<AdminSessionUser | null> {
  const cookieStore = await cookies();
  const tokenSession = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!tokenSession) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: tokenSession.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      active: true,
      permissions: true,
    },
  });
  if (!user || !user.active) return null;
  if (
    user.role !== "SUPER_ADMIN" &&
    user.role !== "ADMIN" &&
    user.role !== "STAFF"
  ) {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    permissions: parsePermissionsJson(user.permissions),
    email: user.email,
    displayName: user.displayName,
    active: user.active,
  };
}

/**
 * Server-side seed for the client session provider, so permission-gated UI
 * renders in its final state on first paint instead of after a client fetch.
 */
export async function loadAdminClientSession(): Promise<AdminClientSessionUser | null> {
  const session = await loadAdminSession();
  if (!session) return null;
  return {
    id: session.userId,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    permissions:
      session.role === "SUPER_ADMIN"
        ? [...ALL_ADMIN_PERMISSIONS]
        : session.permissions,
  };
}

export function toPermissionBearer(
  session: AdminSession | AdminSessionUser,
): PermissionBearer {
  return { role: session.role, permissions: session.permissions };
}

export async function requireAdminPermission(
  permission: AdminPermission,
): Promise<
  | { ok: true; session: AdminSessionUser }
  | { ok: false; response: NextResponse }
> {
  const session = await loadAdminSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!hasPermission(toPermissionBearer(session), permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

export async function requireAdminAnyPermission(
  permissions: AdminPermission[],
): Promise<
  | { ok: true; session: AdminSessionUser }
  | { ok: false; response: NextResponse }
> {
  const session = await loadAdminSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!hasAnyPermission(toPermissionBearer(session), permissions)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}

export async function requireSuperAdmin(): Promise<
  | { ok: true; session: AdminSessionUser }
  | { ok: false; response: NextResponse }
> {
  const session = await loadAdminSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session };
}
