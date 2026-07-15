import type { FulfillmentMode } from "@/types/restaurant-settings";

export const POS_MOBILE_EDIT_DRAFT_KEY = "khaanz_pos_mobile_edit_draft";

export type PosMobileEditDraft = {
  orderId: string;
  orderRef: string | null;
  fulfillment: FulfillmentMode;
  customerName: string;
  phone: string;
  address: string;
  landmark: string;
  notes: string;
  paymentMethod: string;
  dineInTable: string;
  deliveryChargeMinor: number;
  discountMinor: number;
  lines: { sortIndex: number; payload: unknown }[];
};

export function writePosMobileEditDraft(draft: PosMobileEditDraft): void {
  try {
    sessionStorage.setItem(POS_MOBILE_EDIT_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read and remove draft (one-shot load into the mobile register). */
export function consumePosMobileEditDraft(): PosMobileEditDraft | null {
  try {
    const raw = sessionStorage.getItem(POS_MOBILE_EDIT_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(POS_MOBILE_EDIT_DRAFT_KEY);
    const parsed = JSON.parse(raw) as PosMobileEditDraft;
    if (!parsed?.orderId || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}
