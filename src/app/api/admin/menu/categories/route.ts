import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { normalizeMenuCategories } from "@/lib/menu-payload-normalize";
import {
  writeCategoryItemsNotForSale,
  writeMenuCategories,
} from "@/lib/menu-repository";

function parseCategoriesBody(body: unknown): {
  categories: ReturnType<typeof normalizeMenuCategories>;
  markNotForSaleCategory?: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (!Array.isArray(o.categories)) return null;
  const categories = normalizeMenuCategories(o.categories);
  const markNotForSaleCategory =
    typeof o.markNotForSaleCategory === "string" &&
    o.markNotForSaleCategory.trim()
      ? o.markNotForSaleCategory.trim()
      : undefined;
  return { categories, markNotForSaleCategory };
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseCategoriesBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await writeMenuCategories(parsed.categories);
    if (parsed.markNotForSaleCategory) {
      await writeCategoryItemsNotForSale(parsed.markNotForSaleCategory, true);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
