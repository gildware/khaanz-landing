type FbqFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: FbqFunction;
};

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

/** Public Pixel ID (also in the browser snippet). Override with NEXT_PUBLIC_META_PIXEL_ID. */
export const META_PIXEL_ID = (
  process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "2047975355823982"
).replace(/[^\d]/g, "");

const CURRENCY = "INR";

function fbqTrack(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;
  if (params) window.fbq("track", event, params);
  else window.fbq("track", event);
}

export function trackAddToCart(params: {
  contentId: string;
  contentName: string;
  value: number;
}) {
  fbqTrack("AddToCart", {
    content_ids: [params.contentId],
    content_name: params.contentName,
    content_type: "product",
    value: params.value,
    currency: CURRENCY,
  });
}

export function trackPurchase(params: {
  value: number;
  contentIds: string[];
  numItems: number;
  orderId?: string;
}) {
  fbqTrack("Purchase", {
    value: params.value,
    currency: CURRENCY,
    content_ids: params.contentIds,
    content_type: "product",
    num_items: params.numItems,
    ...(params.orderId ? { order_id: params.orderId } : {}),
  });
}
