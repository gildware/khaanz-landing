import { Prisma } from "@prisma/client";

export const D0 = new Prisma.Decimal(0);

export function d(n: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

export function decMax(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.greaterThan(b) ? a : b;
}

/** Recipe ingredient qty: store/display up to 2 decimal places. */
export function roundRecipeQtyBase(
  q: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return new Prisma.Decimal(q).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function formatRecipeQtyBase(q: Prisma.Decimal | number | string): string {
  return roundRecipeQtyBase(q).toString();
}
