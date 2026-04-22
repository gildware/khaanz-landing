import { cookies } from "next/headers";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";

export async function requireAdminInventorySession() {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  return session;
}
