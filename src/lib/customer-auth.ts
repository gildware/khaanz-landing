import { SignJWT, jwtVerify } from "jose";

export const CUSTOMER_TOKEN_COOKIE = "customer_token";

export type CustomerSession = {
  customerId: string;
  phoneDigits: string;
};

function getSecret(): Uint8Array {
  const s =
    process.env.CUSTOMER_SESSION_SECRET ??
    process.env.ADMIN_SESSION_SECRET ??
    "khaanz-dev-customer-session-change-me";
  return new TextEncoder().encode(s);
}

export async function createCustomerToken(
  customerId: string,
  phoneDigits: string,
): Promise<string> {
  return new SignJWT({ pd: phoneDigits })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customerId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyCustomerToken(
  token: string | undefined,
): Promise<CustomerSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const customerId = typeof payload.sub === "string" ? payload.sub : null;
    const phoneDigits =
      payload.pd && typeof payload.pd === "string" ? payload.pd : null;
    if (!customerId || !phoneDigits || !/^\d{10,15}$/.test(phoneDigits)) {
      return null;
    }
    return { customerId, phoneDigits };
  } catch {
    return null;
  }
}
