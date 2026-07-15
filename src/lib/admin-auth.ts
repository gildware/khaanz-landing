import { SignJWT, jwtVerify } from "jose";

import type { AdminPermission } from "@/lib/admin-permissions";
import {
  hasPermission,
  parsePermissionsJson,
  type PermissionBearer,
} from "@/lib/admin-permissions";

export const ADMIN_TOKEN_COOKIE = "admin_token";

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "STAFF";

export type AdminSession = {
  userId: string;
  role: AdminRole;
  permissions: AdminPermission[];
};

function getSecret(): Uint8Array {
  const s =
    process.env.ADMIN_SESSION_SECRET ?? "khaanz-dev-admin-secret-change-me";
  return new TextEncoder().encode(s);
}

function parseRole(role: unknown): AdminRole | null {
  if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "STAFF") {
    return role;
  }
  return null;
}

export async function createAdminToken(
  userId: string,
  role: AdminRole,
  permissions: AdminPermission[] = [],
): Promise<string> {
  return new SignJWT({ role, permissions })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyAdminToken(
  token: string | undefined,
): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const role = parseRole(payload.role);
    if (!userId || !role) return null;
    const permissions = parsePermissionsJson(payload.permissions);
    return { userId, role, permissions };
  } catch {
    return null;
  }
}

export function isSuperAdmin(session: AdminSession | null): boolean {
  return session?.role === "SUPER_ADMIN";
}

export function sessionHasPermission(
  session: AdminSession | null | undefined,
  permission: AdminPermission,
): boolean {
  if (!session) return false;
  const bearer: PermissionBearer = {
    role: session.role,
    permissions: session.permissions,
  };
  return hasPermission(bearer, permission);
}
