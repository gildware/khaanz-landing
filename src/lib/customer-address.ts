import type { Prisma } from "@prisma/client";

/** Max saved addresses kept per customer; oldest-used beyond this are pruned. */
export const MAX_SAVED_ADDRESSES = 10;

export interface SavedAddressInput {
  address: string;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SavedAddressDTO {
  id: string;
  address: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  lastUsedAt: string;
}

/** Normalized key used to detect "the same" address (case/whitespace-insensitive). */
export function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sanitizeAddressInput(
  input: SavedAddressInput,
): { address: string; landmark: string; latitude: number | null; longitude: number | null } | null {
  const address = (input.address ?? "").trim().slice(0, 500);
  if (address.length < 3) return null;
  const landmark = (input.landmark ?? "").trim().slice(0, 200);
  const latitude =
    typeof input.latitude === "number" && Number.isFinite(input.latitude)
      ? input.latitude
      : null;
  const longitude =
    typeof input.longitude === "number" && Number.isFinite(input.longitude)
      ? input.longitude
      : null;
  return { address, landmark, latitude, longitude };
}

/**
 * Saves (or refreshes) a delivery address for a customer.
 * If an address with the same normalized text already exists it is updated and
 * marked most-recently-used; otherwise a new row is created. Keeps at most
 * MAX_SAVED_ADDRESSES rows per customer (drops least-recently-used).
 */
export async function upsertCustomerAddress(
  db: Prisma.TransactionClient,
  customerId: string,
  input: SavedAddressInput,
): Promise<void> {
  const clean = sanitizeAddressInput(input);
  if (!clean) return;

  const key = normalizeAddressKey(clean.address);
  const existing = await db.customerAddress.findMany({
    where: { customerId },
    orderBy: { lastUsedAt: "desc" },
  });

  const match = existing.find((a) => normalizeAddressKey(a.address) === key);
  const now = new Date();

  if (match) {
    await db.customerAddress.update({
      where: { id: match.id },
      data: {
        address: clean.address,
        landmark: clean.landmark,
        latitude: clean.latitude,
        longitude: clean.longitude,
        lastUsedAt: now,
      },
    });
    return;
  }

  await db.customerAddress.create({
    data: {
      customerId,
      address: clean.address,
      landmark: clean.landmark,
      latitude: clean.latitude,
      longitude: clean.longitude,
      lastUsedAt: now,
    },
  });

  // Prune anything beyond the most-recent MAX_SAVED_ADDRESSES.
  if (existing.length + 1 > MAX_SAVED_ADDRESSES) {
    const keepIds = new Set(
      existing.slice(0, MAX_SAVED_ADDRESSES - 1).map((a) => a.id),
    );
    const toDelete = existing
      .filter((a) => !keepIds.has(a.id))
      .map((a) => a.id);
    if (toDelete.length > 0) {
      await db.customerAddress.deleteMany({
        where: { id: { in: toDelete }, customerId },
      });
    }
  }
}

export function toSavedAddressDTO(row: {
  id: string;
  address: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  lastUsedAt: Date;
}): SavedAddressDTO {
  return {
    id: row.id,
    address: row.address,
    landmark: row.landmark,
    latitude: row.latitude,
    longitude: row.longitude,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}
