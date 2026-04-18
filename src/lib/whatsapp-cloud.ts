const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const CAPTION_MAX = 1024;
const TEXT_BODY_MAX = 4096;

function truncateCaption(text: string): string {
  if (text.length <= CAPTION_MAX) return text;
  return `${text.slice(0, CAPTION_MAX - 3)}...`;
}

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

async function uploadPdfMedia(options: {
  accessToken: string;
  phoneNumberId: string;
  pdfBytes: Uint8Array;
  filename: string;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  const { accessToken, phoneNumberId, pdfBytes, filename } = options;
  const uploadUrl = `${GRAPH_BASE}/${phoneNumberId}/media`;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "document");
  form.append(
    "file",
    new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" }),
    filename,
  );

  const upload = await graphJson<{ id: string }>(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!upload.ok) {
    return upload;
  }
  return { ok: true, mediaId: upload.data.id };
}

async function sendDocumentMessage(options: {
  accessToken: string;
  phoneNumberId: string;
  toDigits: string;
  mediaId: string;
  filename: string;
  caption: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    accessToken,
    phoneNumberId,
    toDigits,
    mediaId,
    filename,
    caption,
  } = options;
  const sendUrl = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toDigits,
    type: "document",
    document: {
      id: mediaId,
      filename,
      caption: truncateCaption(caption),
    },
  };

  return graphJson<{ messages?: unknown }>(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export interface SendOrderWhatsAppResult {
  /** PDF document delivered to WhatsApp */
  documentSent: boolean;
  /** Formatted order summary text */
  textSent: boolean;
  /** First failure reason (document upload/send preferred for debugging) */
  lastError?: string;
}

/**
 * Sends (1) a formatted text summary, then (2) the invoice PDF as a document.
 * Two bubbles make the order readable and the file easy to spot in the chat.
 */
export async function sendRestaurantOrderViaWhatsAppCloud(options: {
  accessToken: string;
  phoneNumberId: string;
  toDigits: string;
  pdfBytes: Uint8Array;
  filename: string;
  orderSummaryText: string;
  /** Short caption under the PDF file (WhatsApp shows filename + caption) */
  documentCaption: string;
}): Promise<SendOrderWhatsAppResult> {
  const {
    accessToken,
    phoneNumberId,
    toDigits,
    pdfBytes,
    filename,
    orderSummaryText,
    documentCaption,
  } = options;

  let textSent = false;
  let documentSent = false;
  let lastError: string | undefined;

  const textResult = await sendTextMessage({
    accessToken,
    phoneNumberId,
    toDigits,
    body: orderSummaryText,
  });
  if (textResult.ok) {
    textSent = true;
  } else {
    lastError = `Text: ${textResult.error}`;
    console.error("WhatsApp Cloud text message failed:", textResult.error);
  }

  const upload = await uploadPdfMedia({
    accessToken,
    phoneNumberId,
    pdfBytes,
    filename,
  });
  if (!upload.ok) {
    lastError = `PDF upload: ${upload.error}`;
    console.error("WhatsApp Cloud media upload failed:", upload.error);
    return { documentSent, textSent, lastError };
  }

  const doc = await sendDocumentMessage({
    accessToken,
    phoneNumberId,
    toDigits,
    mediaId: upload.mediaId,
    filename,
    caption: documentCaption,
  });
  if (!doc.ok) {
    lastError = `PDF send: ${doc.error}`;
    console.error("WhatsApp Cloud document message failed:", doc.error);
    return { documentSent, textSent, lastError };
  }

  documentSent = true;
  return { documentSent, textSent, lastError };
}

export function isWhatsAppCloudConfigured(): boolean {
  return (
    !!process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() &&
    !!process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim()
  );
}
