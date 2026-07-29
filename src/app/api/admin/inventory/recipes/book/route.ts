import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { loadRecipeExportBook } from "@/lib/inventory/recipe-export-data";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const book = await loadRecipeExportBook();
  return NextResponse.json(book);
}
