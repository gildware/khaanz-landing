import { getPrisma } from "@/lib/prisma";
import {
  isPosAnonymousPhoneDigits,
  normalizeIndianMobileDigits,
  POS_ANONYMOUS_PHONE_DIGITS,
} from "@/lib/phone-digits";

export type DeliveryCustomerSuggestion = {
  phoneDigits: string;
  displayName: string;
  address: string;
  landmark: string;
};

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 20;

function buildCustomerWhere(query: string) {
  const q = query.trim();
  const phoneQ = normalizeIndianMobileDigits(q);
  const hasLetters = /[a-zA-Z]/.test(q);

  const base = {
    phoneDigits: { not: POS_ANONYMOUS_PHONE_DIGITS },
    orders: { some: { fulfillment: "delivery" as const } },
  };

  if (!q) return base;

  const or: Array<Record<string, unknown>> = [];
  if (phoneQ.length > 0) {
    or.push({ phoneDigits: { startsWith: phoneQ } });
  }
  if (hasLetters && q.length >= 2) {
    or.push({ displayName: { contains: q, mode: "insensitive" as const } });
  }
  if (or.length === 0) {
    or.push({ phoneDigits: { startsWith: phoneQ || q.replace(/\D/g, "") } });
  }

  return { ...base, OR: or };
}

function mapRow(row: {
  phoneDigits: string;
  displayName: string | null;
  orders: Array<{ address: string; landmark: string; createdAt: Date }>;
}): DeliveryCustomerSuggestion | null {
  const latest = row.orders[0];
  if (!latest || isPosAnonymousPhoneDigits(row.phoneDigits)) return null;
  return {
    phoneDigits: row.phoneDigits,
    displayName: (row.displayName || "").trim() || "Guest",
    address: latest.address.trim(),
    landmark: latest.landmark.trim(),
  };
}

export async function searchDeliveryCustomers(
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<DeliveryCustomerSuggestion[]> {
  const take = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const prisma = getPrisma();

  const rows = await prisma.customer.findMany({
    where: buildCustomerWhere(query),
    select: {
      phoneDigits: true,
      displayName: true,
      orders: {
        where: { fulfillment: "delivery" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { address: true, landmark: true, createdAt: true },
      },
    },
    take: take * 3,
  });

  return rows
    .map(mapRow)
    .filter((r): r is DeliveryCustomerSuggestion => r !== null)
    .sort((a, b) => {
      const aOrder = rows.find((r) => r.phoneDigits === a.phoneDigits)?.orders[0];
      const bOrder = rows.find((r) => r.phoneDigits === b.phoneDigits)?.orders[0];
      const aTime = aOrder?.createdAt.getTime() ?? 0;
      const bTime = bOrder?.createdAt.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, take);
}
