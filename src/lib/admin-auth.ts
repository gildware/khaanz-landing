import { SignJWT, jwtVerify } from "jose";

const COOKIE = "admin_token";

function getSecret(): Uint8Array {
  const s =
    process.env.ADMIN_SESSION_SECRET ?? "khaanz-dev-admin-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function createAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "khaanzadmin";
  return password === expected;
}

export { COOKIE as ADMIN_TOKEN_COOKIE };
