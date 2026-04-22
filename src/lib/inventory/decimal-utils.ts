import { Prisma } from "@prisma/client";

export const D0 = new Prisma.Decimal(0);

export function d(n: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

export function decMax(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.greaterThan(b) ? a : b;
}
