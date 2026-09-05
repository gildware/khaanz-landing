export type PurchaseBill = {
  url: string;
  fileName: string;
};

export const MAX_PURCHASE_BILLS = 8;

function isCloudinaryBillUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

export function parsePurchaseBills(raw: unknown): PurchaseBill[] {
  if (!Array.isArray(raw)) return [];
  const out: PurchaseBill[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url || !isCloudinaryBillUrl(url)) continue;
    const fileName =
      typeof o.fileName === "string" ? o.fileName.trim().slice(0, 200) : "";
    out.push({ url, fileName: fileName || "bill" });
    if (out.length >= MAX_PURCHASE_BILLS) break;
  }
  return out;
}
