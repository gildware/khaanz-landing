import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import {
  applyRecipeReconcileAdjustments,
  previewRecipeSalesReconcile,
  type RecipeReconcileMode,
} from "@/lib/inventory/reconcile-recipe-sales";
import { parseIstDateInput } from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseMode(raw: unknown): RecipeReconcileMode {
  return raw === "at_sale" ? "at_sale" : "current";
}

/**
 * `from` / `to` are inclusive IST calendar days (YYYY-MM-DD preferred).
 * ISO datetimes are also accepted. `to` becomes an exclusive upper bound
 * (start of the next IST day when a date-only value is given).
 */
function parseDayBound(
  raw: string | null | undefined,
  role: "from" | "to",
): { value: Date | null } | { error: string } {
  if (raw == null || !String(raw).trim()) return { value: null };
  const s = String(raw).trim();
  const day = parseIstDateInput(s);
  if (day) {
    return {
      value: role === "to" ? new Date(day.getTime() + MS_PER_DAY) : day,
    };
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) {
    return { error: role === "from" ? "Invalid from" : "Invalid to" };
  }
  return { value: dt };
}

function parseScope(fromRaw: string | null | undefined, toRaw: string | null | undefined) {
  const fromParsed = parseDayBound(fromRaw, "from");
  if ("error" in fromParsed) return fromParsed;
  const toParsed = parseDayBound(toRaw, "to");
  if ("error" in toParsed) return toParsed;

  const from = fromParsed.value;
  const toExclusive = toParsed.value;
  if (from && toExclusive && !(from < toExclusive)) {
    return { error: "from must be on or before to" as const };
  }
  return { from, toExclusive };
}

/** Preview: recipe plan vs recorded sale deductions for a date range. */
export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = parseScope(url.searchParams.get("from"), url.searchParams.get("to"));
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    // Read-only replay: outside a transaction so long periods can't trip the
    // interactive transaction timeout.
    const preview = await previewRecipeSalesReconcile(prisma, {
      from: scope.from,
      toExclusive: scope.toExclusive,
      recipeAsOf: new Date(),
      mode: parseMode(url.searchParams.get("mode")),
    });
    return NextResponse.json(preview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** Apply CORRECTION adjustments so on-hand matches the chosen recipe mode. */
export async function POST(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Set confirm: true after reviewing the preview" },
      { status: 400 },
    );
  }

  const scope = parseScope(
    typeof body.from === "string" ? body.from : null,
    typeof body.to === "string" ? body.to : null,
  );
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: 400 });
  }

  const prisma = getPrisma();
  const scopeInput = {
    from: scope.from,
    toExclusive: scope.toExclusive,
    mode: parseMode(body.mode),
  };

  try {
    const settings = await ensureInventorySettings(prisma);
    // Replay first (slow, read-only), then write only the deltas so the
    // transaction stays short.
    const preview = await previewRecipeSalesReconcile(prisma, {
      ...scopeInput,
      recipeAsOf: new Date(),
    });

    const appliedCount = await prisma.$transaction(
      (tx) =>
        applyRecipeReconcileAdjustments(tx, {
          preview,
          createdByUserId: session.userId,
          allowNegativeStock: settings.allowNegativeStock,
        }),
      { timeout: 120_000, maxWait: 20_000 },
    );

    const after = await previewRecipeSalesReconcile(prisma, {
      ...scopeInput,
      recipeAsOf: new Date(),
    });
    return NextResponse.json({ ...after, appliedCount });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
