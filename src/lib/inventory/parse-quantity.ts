import { Prisma } from "@prisma/client";

export function parseDecimalQty(
  raw: unknown,
  field: string,
): Prisma.Decimal | { error: string } {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Prisma.Decimal(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      return new Prisma.Decimal(raw.trim());
    } catch {
      return { error: `Invalid decimal for ${field}.` };
    }
  }
  return { error: `Missing or invalid ${field}.` };
}
