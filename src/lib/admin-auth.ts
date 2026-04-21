import { SignJWT, jwtVerify } from "jose";

export const ADMIN_TOKEN_COOKIE = "admin_token";

export type AdminRole = "SUPER_ADMIN" | "ADMIN";

export type AdminSession = {
  userId: string;
  role: AdminRole;
};

function getSecret(): Uint8Array {
  const s =
    process.env.ADMIN_SESSION_SECRET ?? "khaanz-dev-admin-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function createAdminToken(
  userId: string,
  role: AdminRole,
): Promise<string> {
  return new SignJWT({ role })
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
    const role = payload.role;
    if (!userId || (role !== "SUPER_ADMIN" && role !== "ADMIN")) {
      return null;
    }
    return { userId, role };
  } catch {
    return null;
  }
}

export function isSuperAdmin(session: AdminSession | null): boolean {
  return session?.role === "SUPER_ADMIN";
}
