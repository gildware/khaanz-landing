const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const TEXT_BODY_MAX = 4096;

function truncateTextBody(text: string): string {
  if (text.length <= TEXT_BODY_MAX) return text;
  return `${text.slice(0, TEXT_BODY_MAX - 32)}\n\n_(truncated)_`;
}

async function graphJson<T>(
  url: string,
  init: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(url, init);
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const err =
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "message" in data.error &&
      typeof (data.error as { message?: unknown }).message === "string"
        ? (data.error as { message: string }).message
        : `HTTP ${res.status}`;
    return { ok: false, error: err };
  }
  return { ok: true, data: data as T };
}

async function sendTextMessage(options: {
  accessToken: string;
  phoneNumberId: string;
  toDigits: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { accessToken, phoneNumberId, toDigits, body } = options;
  const sendUrl = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toDigits,
    type: "text",
    text: {
      preview_url: true,
      body: truncateTextBody(body),
    },
  };

  return graphJson<{ messages?: unknown }>(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export interface SendOrderWhatsAppResult {
  textSent: boolean;
  lastError?: string;
}

/**
 * Sends the formatted order summary to the restaurant WhatsApp (Cloud API) — text only.
 */
export async function sendRestaurantOrderViaWhatsAppCloud(options: {
  accessToken: string;
  phoneNumberId: string;
  toDigits: string;
  orderSummaryText: string;
}): Promise<SendOrderWhatsAppResult> {
  const { accessToken, phoneNumberId, toDigits, orderSummaryText } = options;

  const textResult = await sendTextMessage({
    accessToken,
    phoneNumberId,
    toDigits,
    body: orderSummaryText,
  });
  if (textResult.ok) {
    return { textSent: true };
  }
  console.error("WhatsApp Cloud text message failed:", textResult.error);
  return { textSent: false, lastError: textResult.error };
}

export function isWhatsAppCloudConfigured(): boolean {
  return (
    !!process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() &&
    !!process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim()
  );
}

/**
 * Sends a plain text WhatsApp message to any E.164-style digit string (no +).
 * Uses the same Cloud API app as restaurant order alerts.
 */
export async function sendWhatsAppCloudText(options: {
  toDigits: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isWhatsAppCloudConfigured()) {
    return { ok: false, error: "WhatsApp Cloud is not configured." };
  }
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN!.trim();
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID!.trim();
  const r = await sendTextMessage({
    accessToken,
    phoneNumberId,
    toDigits: options.toDigits.replace(/\D/g, ""),
    body: options.body,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
