import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getDefaultMenuPayload } from "@/data/menu";
import { ADMIN_RESET_CONFIRM_PHRASE } from "@/lib/admin-reset-confirm-phrase";
import { resetAllTenantData } from "@/lib/admin-reset-all-data";
import { writeMenuPayload } from "@/lib/menu-repository";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const phrase =
    body &&
    typeof body === "object" &&
    typeof (body as { confirmPhrase?: unknown }).confirmPhrase === "string"
      ? (body as { confirmPhrase: string }).confirmPhrase.trim()
      : "";
  if (phrase !== ADMIN_RESET_CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: `Type the exact phrase: ${ADMIN_RESET_CONFIRM_PHRASE}`,
      },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  try {
    await prisma.$transaction(
      async (tx) => {
        await resetAllTenantData(tx);
      },
      { timeout: 120_000 },
    );
    await writeMenuPayload(getDefaultMenuPayload());
  } catch (e) {
    console.error("reset-data failed", e);
    return NextResponse.json(
      { error: "Reset failed. Check server logs." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
