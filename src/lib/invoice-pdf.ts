import { readFile } from "fs/promises";
import { join } from "path";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import type { CartLine } from "@/types/menu";
import type { FulfillmentMode } from "@/types/restaurant-settings";
import { formatScheduleHuman, type ScheduleMode } from "@/lib/order-schedule";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_R = PAGE_W - MARGIN;
const CONTENT_W = CONTENT_R - MARGIN;
const FONT_SIZE = 10;
const SMALL = 9;
const TITLE_SIZE = 18;
const ACCENT = rgb(0.15, 0.15, 0.15);
const MUTED = rgb(0.35, 0.35, 0.35);
const RULE = rgb(0.82, 0.82, 0.82);

function wrapLine(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, fontSize) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface InvoiceOrderInput {
  orderId: string;
  createdAt: Date;
  restaurantName: string;
  customerName: string;
  phone: string;
  fulfillment: FulfillmentMode;
  scheduleMode: ScheduleMode;
  scheduledAt: string | null;
  address: string;
  landmark: string;
  notes: string;
  lines: CartLine[];
  latitude: number | null;
  longitude: number | null;
}

function formatMoney(n: number): string {
  return n.toFixed(0);
}

function scheduleLine(input: InvoiceOrderInput): string {
  if (input.scheduleMode === "asap") {
    return input.fulfillment === "pickup"
      ? "ASAP - pick up when ready"
      : "ASAP - deliver when ready";
  }
  const scheduledDate = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const scheduledValid =
    scheduledDate !== null && !Number.isNaN(scheduledDate.getTime());
  return scheduledValid
    ? formatScheduleHuman(input.scheduleMode, scheduledDate)
    : "Scheduled (time not set)";
}

function drawRule(
  page: import("pdf-lib").PDFPage,
  y: number,
  marginL: number,
  marginR: number,
) {
  page.drawLine({
    start: { x: marginL, y },
    end: { x: marginR, y },
    thickness: 0.75,
    color: RULE,
  });
}

export async function buildInvoicePdf(input: InvoiceOrderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const lineGap = 3;

  const drawParagraph = (
    text: string,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = opts.bold ? fontBold : font;
    const color = opts.color ?? ACCENT;
    for (const line of wrapLine(text, f, size, CONTENT_W)) {
      if (!line.trim()) continue;
      if (y < MARGIN + 56) {
        page = doc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: f,
        color,
      });
      y -= size + lineGap;
    }
  };

  /** Logo (optional) */
  try {
    const logoPath = join(process.cwd(), "public", "brand", "khaanz-logo.png");
    const pngBytes = await readFile(logoPath);
    const logoImage = await doc.embedPng(pngBytes);
    const maxW = 140;
    const scale = maxW / logoImage.width;
    const imgW = maxW;
    const imgH = logoImage.height * scale;
    const imgBottom = y - imgH;
    page.drawImage(logoImage, {
      x: MARGIN,
      y: imgBottom,
      width: imgW,
      height: imgH,
    });
    y = imgBottom - 14;
  } catch {
    // no logo file
  }

  page.drawText(input.restaurantName.toUpperCase(), {
    x: MARGIN,
    y,
    size: TITLE_SIZE,
    font: fontBold,
    color: ACCENT,
  });
  y -= TITLE_SIZE + 6;

  drawParagraph("Tax invoice & order summary", SMALL, { color: MUTED });
  y -= 4;
  drawRule(page, y, MARGIN, CONTENT_R);
  y -= 16;

  drawParagraph(`Order ID: ${input.orderId}`, SMALL, { bold: true });
  drawParagraph(
    `Placed on: ${input.createdAt.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`,
    SMALL,
    { color: MUTED },
  );
  y -= 4;

  const orderType =
    input.fulfillment === "pickup"
      ? "Pickup (customer collects)"
      : "Delivery";
  drawParagraph("Order details", FONT_SIZE, { bold: true });
  drawParagraph(`Type: ${orderType}`, FONT_SIZE);
  drawParagraph(`When: ${scheduleLine(input)}`, FONT_SIZE);
  y -= 6;

  drawParagraph("Customer", FONT_SIZE, { bold: true });
  drawParagraph(input.customerName, FONT_SIZE);
  drawParagraph(`+91 ${input.phone}`, FONT_SIZE);
  if (input.fulfillment === "delivery") {
    drawParagraph(input.address, FONT_SIZE);
    if (input.landmark.trim()) {
      drawParagraph(`Landmark: ${input.landmark}`, SMALL, { color: MUTED });
    }
  }
  if (input.notes.trim()) {
    drawParagraph(`Notes: ${input.notes}`, FONT_SIZE);
  }
  if (
    input.fulfillment === "delivery" &&
    input.latitude != null &&
    input.longitude != null
  ) {
    drawParagraph(
      `Location: maps.google.com/?q=${input.latitude},${input.longitude}`,
      SMALL,
      { color: MUTED },
    );
  }
  y -= 8;

  drawParagraph("Line items", FONT_SIZE, { bold: true });
  y -= 2;
  drawRule(page, y, MARGIN, CONTENT_R);
  y -= 14;

  let subtotal = 0;
  for (const line of input.lines) {
    const lineTotal = line.unitPrice * line.quantity;
    subtotal += lineTotal;
    const addonPart =
      line.addons.length > 0
        ? ` (${line.addons.map((a) => a.name).join(", ")})`
        : "";

    const title = `${line.name} (${line.variation.name})${addonPart}`;
    drawParagraph(title, FONT_SIZE, { bold: true });

    const qtyLine = `Qty ${line.quantity}  ×  Rs. ${formatMoney(line.unitPrice)}`;
    const amt = `Rs. ${formatMoney(lineTotal)}`;
    if (y < MARGIN + 56) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    page.drawText(qtyLine, {
      x: MARGIN,
      y,
      size: SMALL,
      font,
      color: MUTED,
    });
    const aw = fontBold.widthOfTextAtSize(amt, FONT_SIZE + 1);
    page.drawText(amt, {
      x: CONTENT_R - aw,
      y,
      size: FONT_SIZE + 1,
      font: fontBold,
      color: ACCENT,
    });
    y -= SMALL + lineGap + 8;

    drawRule(page, y, MARGIN, CONTENT_R);
    y -= 12;
  }

  y -= 4;
  page.drawText("Subtotal", {
    x: MARGIN,
    y,
    size: FONT_SIZE,
    font: fontBold,
    color: MUTED,
  });
  const subW = fontBold.widthOfTextAtSize(`Rs. ${formatMoney(subtotal)}`, FONT_SIZE + 2);
  page.drawText(`Rs. ${formatMoney(subtotal)}`, {
    x: CONTENT_R - subW,
    y,
    size: FONT_SIZE + 2,
    font: fontBold,
    color: ACCENT,
  });
  y -= FONT_SIZE + 14;

  drawParagraph(
    "Thank you for ordering with us. This document is a summary for kitchen and customer records.",
    SMALL,
    { color: MUTED },
  );

  return doc.save();
}
