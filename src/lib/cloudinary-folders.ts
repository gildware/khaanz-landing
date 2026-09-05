export const CLOUDINARY_FOLDER_ITEMS = "khaanz/menu";
export const CLOUDINARY_FOLDER_COMBOS = "khaanz/combos";
export const CLOUDINARY_FOLDER_CATEGORIES = "khaanz/categories";
export const CLOUDINARY_FOLDER_PURCHASE_BILLS = "khaanz/purchase-bills";

/** Cloudinary path: khaanz/purchase-bills/{Vendor-name}/bills */
export function purchaseBillCloudinaryFolder(supplierName: string): string {
  const slug = supplierName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const vendor = slug.length > 0 ? slug : "unknown-supplier";
  return `${CLOUDINARY_FOLDER_PURCHASE_BILLS}/${vendor}/bills`;
}

export function isPurchaseBillCloudinaryFolder(folder: string): boolean {
  return (
    folder === CLOUDINARY_FOLDER_PURCHASE_BILLS ||
    /^khaanz\/purchase-bills\/[a-zA-Z0-9_-]{1,80}\/bills$/.test(folder)
  );
}
