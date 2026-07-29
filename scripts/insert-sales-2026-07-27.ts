/**
 * Insert 2026-07-27 sales from the preview JSON (one historical POS order).
 * Run: npx tsx scripts/insert-sales-2026-07-27.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { persistPosOrderToDatabase } from "../src/lib/persist-order-db";
import { readRestaurantSettings } from "../src/lib/settings-repository";
import { POS_ANONYMOUS_PHONE_DIGITS } from "../src/lib/phone-digits";
import type { CartLine, CartItemLine, CartOpenLine } from "../src/types/menu";
import type { OrderCreateParsed } from "../src/lib/parse-order-create-body";

const SALE_DATE = "2026-07-27";
const PREVIEW = join(process.cwd(), "samples", "sales-preview-2026-07-27.json");

type PreviewLine = {
  source: string;
  reportItem: string;
  qty: number;
  unitPrice: number;
  reportTotal: number;
  action: string;
  match: {
    menuItemId: string;
    menuItemName: string;
    variationId: string;
    variationName: string;
    dbPrice: number;
  } | null;
};

type PreviewFile = {
  saleDate: string;
  previewGrand: number;
  lines: PreviewLine[];
};

async function main() {
  const prisma = new PrismaClient();
  try {
    const preview = JSON.parse(readFileSync(PREVIEW, "utf8")) as PreviewFile;
    const start = new Date(`${SALE_DATE}T00:00:00+05:30`);
    const end = new Date(`2026-07-28T00:00:00+05:30`);

    const existing = await prisma.order.aggregate({
      where: { createdAt: { gte: start, lt: end } },
      _count: true,
      _sum: { totalMinor: true },
    });
    if (existing._count > 0) {
      throw new Error(
        `Abort: ${existing._count} order(s) already exist for ${SALE_DATE} (₹${(existing._sum.totalMinor ?? 0) / 100}).`,
      );
    }

    const settings = await readRestaurantSettings();
    const paymentMethodKey =
      settings.paymentMethods.find((p) => p.id === "cash")?.id ??
      settings.paymentMethods[0]?.id;
    if (!paymentMethodKey) {
      throw new Error("No payment methods configured.");
    }

    const admin =
      (await prisma.user.findFirst({
        where: { email: "manager@khaanz.in" },
        select: { id: true, email: true },
      })) ??
      (await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      }));

    const menuById = new Map(
      (
        await prisma.menuItem.findMany({
          include: { variations: true },
        })
      ).map((m) => [m.id, m]),
    );

    const cartLines: CartLine[] = [];
    for (const row of preview.lines) {
      if (row.action === "skip_excel_open_aggregate") continue;

      if (row.action === "menu_item" && row.match) {
        const dish = menuById.get(row.match.menuItemId);
        if (!dish) {
          throw new Error(`Menu item missing: ${row.match.menuItemId}`);
        }
        const variation = dish.variations.find(
          (v) => v.id === row.match!.variationId,
        );
        if (!variation) {
          throw new Error(
            `Variation missing: ${row.match.menuItemId}/${row.match.variationId}`,
          );
        }
        const line: CartItemLine = {
          kind: "item",
          lineId: randomUUID(),
          itemId: dish.id,
          name: dish.name,
          image: dish.image ?? "",
          isVeg: dish.isVeg,
          variation: {
            id: variation.id,
            name: variation.name,
            price: variation.price,
          },
          addons: [],
          quantity: Math.round(row.qty),
          unitPrice: variation.price,
        };
        cartLines.push(line);
        continue;
      }

      if (row.action === "open_item") {
        const line: CartOpenLine = {
          kind: "open",
          lineId: randomUUID(),
          name: row.reportItem.trim() || "Open item",
          quantity: Math.max(1, Math.round(row.qty)),
          unitPrice: row.unitPrice,
        };
        cartLines.push(line);
        continue;
      }

      throw new Error(`Unhandled preview action: ${row.action} (${row.reportItem})`);
    }

    if (cartLines.length === 0) {
      throw new Error("No lines to insert.");
    }

    const expectedMinor = Math.round(preview.previewGrand * 100);
    const linesMinor = cartLines.reduce(
      (s, l) => s + Math.round(l.unitPrice * 100) * l.quantity,
      0,
    );
    if (linesMinor !== expectedMinor) {
      throw new Error(
        `Total mismatch before insert: lines ₹${linesMinor / 100} vs preview ₹${preview.previewGrand}`,
      );
    }

    const parsed: OrderCreateParsed = {
      customerName: "Guest",
      phone: POS_ANONYMOUS_PHONE_DIGITS,
      fulfillment: "pickup",
      scheduleMode: "asap",
      scheduledAt: null,
      address: "",
      landmark: "",
      notes:
        "Item-wise sales report 2026-07-27 + open-items notebook (preview insert)",
      lines: cartLines,
      latitude: null,
      longitude: null,
    };

    const soldAt = new Date(`${SALE_DATE}T12:00:00+05:30`);
    const orderId = randomUUID();
    const out = await persistPosOrderToDatabase(orderId, parsed, {
      paymentMethodKey,
      dineInTable: "",
      adminUserId: admin?.id ?? null,
      createdByLabel: admin?.email ?? "sales-import",
      soldAt,
      historical: true,
    });

    const verify = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderRef: true,
        totalMinor: true,
        createdAt: true,
        paymentMethod: true,
        notes: true,
        _count: { select: { lines: true } },
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          orderId,
          orderRef: out.orderRef,
          soldAt: soldAt.toISOString(),
          paymentMethod: paymentMethodKey,
          lineCount: cartLines.length,
          totalRupees: (verify?.totalMinor ?? 0) / 100,
          createdAt: verify?.createdAt,
          dbLineCount: verify?._count.lines,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
