import { getKhaanzDesktop } from "@/lib/khaanz-desktop-client";
import { isPosAnonymousPhoneDigits } from "@/lib/phone-digits";
import type { CartLine } from "@/types/menu";
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";

export type PosReceiptAddonRow = {
  name: string;
  /** Total add-on units (per-item add-on qty × line qty). */
  qty: number;
  unit: number;
  subtotal: number;
};

export type PosReceiptLine = {
  label: string;
  qty: number;
  unit: number;
  subtotal: number;
  /** One table row each: same Qty / ₹ / ₹ columns as the main line. */
  addonRows?: PosReceiptAddonRow[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cartLinesToReceiptRows(lines: CartLine[]): PosReceiptLine[] {
  return lines.map((line) => {
    const subtotal = line.unitPrice * line.quantity;
    if (isCartComboLine(line)) {
      const detail = line.componentSummary
        ? ` — ${line.componentSummary}`
        : "";
      return {
        label: `${line.name} (Combo)${detail}`,
        qty: line.quantity,
        unit: line.unitPrice,
        subtotal,
      };
    }
    if (isCartOpenLine(line)) {
      return {
        label: `${line.name} (Open)`,
        qty: line.quantity,
        unit: line.unitPrice,
        subtotal,
      };
    }
    if (isCartItemLine(line)) {
      const L = line.quantity;
      const addonRows =
        line.addons.length > 0
          ? line.addons
              .filter((a) => a.quantity > 0)
              .map((a) => {
                const totalUnits = a.quantity * L;
                return {
                  name: a.name,
                  qty: totalUnits,
                  unit: a.price,
                  subtotal: a.price * a.quantity * L,
                };
              })
          : undefined;
      return {
        label: `${line.name} (${line.variation.name})`,
        qty: line.quantity,
        unit: line.unitPrice,
        subtotal,
        addonRows: addonRows && addonRows.length > 0 ? addonRows : undefined,
      };
    }
    throw new Error("Invalid cart line");
  });
}

export function kotLinesFromCart(
  lines: CartLine[],
): {
  label: string;
  qty: number;
  addonRows?: PosReceiptAddonRow[];
}[] {
  return cartLinesToReceiptRows(lines).map((r) => ({
    label: r.label,
    qty: r.qty,
    addonRows: r.addonRows,
  }));
}

/** Fulfillment enum value as stored on `Order` (e.g. Prisma). */
export function fulfillmentLabelFromKey(fulfillment: string): string {
  if (fulfillment === "dine_in") return "Dine-in";
  if (fulfillment === "pickup") return "Pickup";
  if (fulfillment === "delivery") return "Delivery";
  return fulfillment;
}

/**
 * Parse a persisted order line `payload` JSON into a POS receipt row
 * (website checkout and POS saved orders use the same shape).
 */
export function orderLinePayloadToPosReceiptLine(
  payload: unknown,
): PosReceiptLine | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const qty =
    typeof p.quantity === "number" && Number.isFinite(p.quantity)
      ? p.quantity
      : 1;
  const unit =
    typeof p.unitPrice === "number" && Number.isFinite(p.unitPrice)
      ? p.unitPrice
      : 0;
  const subtotal = unit * qty;

  if (p.kind === "combo") {
    const detail =
      typeof p.componentSummary === "string" && p.componentSummary.trim()
        ? ` — ${p.componentSummary}`
        : "";
    return {
      label: `${String(p.name)} (Combo)${detail}`,
      qty,
      unit,
      subtotal,
    };
  }

  if (p.kind === "open") {
    return {
      label: `${String(p.name)} (Open)`,
      qty,
      unit,
      subtotal,
    };
  }

  const v = p.variation as Record<string, unknown> | undefined;
  const name = String(p.name);
  const variationName =
    v && typeof v.name === "string" && v.name.trim() ? v.name : "Default";
  const addons = Array.isArray(p.addons) ? p.addons : [];
  const L = qty;
  const addonRows =
    addons.length > 0
      ? (addons as Record<string, unknown>[])
          .filter(
            (a) => typeof a.quantity === "number" && (a.quantity as number) > 0,
          )
          .map((a) => {
            const aq = a.quantity as number;
            const price = typeof a.price === "number" ? a.price : 0;
            const totalUnits = aq * L;
            return {
              name: String(a.name),
              qty: totalUnits,
              unit: price,
              subtotal: price * aq * L,
            };
          })
      : undefined;

  return {
    label: `${name} (${variationName})`,
    qty,
    unit,
    subtotal,
    addonRows: addonRows && addonRows.length > 0 ? addonRows : undefined,
  };
}

export function receiptLineToKotLine(
  r: PosReceiptLine,
): { label: string; qty: number; addonRows?: PosReceiptAddonRow[] } {
  return {
    label: r.label,
    qty: r.qty,
    addonRows: r.addonRows,
  };
}

export function orderLinePayloadsToReceiptLines(
  lines: { payload: unknown }[],
): PosReceiptLine[] {
  const out: PosReceiptLine[] = [];
  for (const l of lines) {
    const r = orderLinePayloadToPosReceiptLine(l.payload);
    if (r) out.push(r);
  }
  return out;
}

/** Opens the system print dialog with 80mm thermal-friendly HTML. */
export function printThermalHtml(html: string, title = "Receipt"): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }

  const w = iframe.contentWindow;
  const remove = () => {
    iframe.remove();
  };

  let printed = false;
  const runPrint = () => {
    if (printed) return;
    printed = true;
    if (!w) {
      remove();
      return;
    }
    const onAfterPrint = () => {
      w.removeEventListener("afterprint", onAfterPrint);
      remove();
    };
    w.addEventListener("afterprint", onAfterPrint);
    try {
      w.focus();
      w.print();
    } catch {
      remove();
      return;
    }
    window.setTimeout(() => {
      w.removeEventListener("afterprint", onAfterPrint);
      remove();
    }, 120_000);
  };

  iframe.onload = () => {
    window.requestAnimationFrame(runPrint);
  };

  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`,
  );
  doc.close();

  if (doc.readyState === "complete") {
    window.requestAnimationFrame(runPrint);
  }
}

const THERMAL_STYLE = `
  @page { size: 80mm auto; margin: 3mm; }
  * {
    box-sizing: border-box;
    font-weight: 700 !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.45;
    margin: 0;
    padding: 8px;
    max-width: 72mm;
  }
  h1 { font-size: 16px; margin: 0 0 8px; font-weight: 700; text-align: center; }
  .pre { white-space: pre-wrap; font-size: 11px; margin: 4px 0; font-weight: 700; }
  .muted { font-size: 11px; margin: 3px 0; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 3px 0; text-align: left; vertical-align: top; font-size: 11px; font-weight: 700; }
  th { border-bottom: 2px solid #000; font-weight: 700; }
  .right { text-align: right; white-space: nowrap; }
  .sep { border-top: 2px solid #000; margin: 8px 0; padding-top: 6px; font-weight: 700; }
  .total { font-weight: 700; font-size: 14px; }
  tr.addon-line td { font-size: 10px; line-height: 1.3; font-weight: 700; }
  tr.addon-line .iname { padding-left: 8px; }
`;

function wrapThermalPrintDocument(bodyHtml: string, title: string): string {
  const safeTitle = escapeHtml(title || "Receipt");
  const body = bodyHtml.replace(/<style>[\s\S]*?<\/style>/gi, "");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title><style>${THERMAL_STYLE}</style></head><body>${body}</body></html>`;
}

export type PosBillPrintOptions = {
  restaurantName: string;
  billHeader: string;
  billFooter: string;
  orderRef: string | null;
  proforma: boolean;
  fulfillmentLabel: string;
  /** Printed on bill / KOT when set (dine-in). */
  dineInTable?: string;
  customerName: string;
  phoneDigits: string;
  notes: string;
  footerNote?: string;
  paymentLabel: string;
  lines: PosReceiptLine[];
  total: number;
  itemsSubtotal?: number;
  deliveryCharge?: number;
  discount?: number;
};

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
}

export function buildBillHtmlBody(o: PosBillPrintOptions): string {
  const headerLines = splitLines(o.billHeader);
  const footerLines = splitLines(o.billFooter);
  const rows = o.lines
    .flatMap((r) => {
      const main = `<tr><td>${escapeHtml(r.label)}</td><td class="right">${r.qty}</td><td class="right">₹${Math.round(
        r.unit,
      )}</td><td class="right">₹${Math.round(r.subtotal)}</td></tr>`;
      const subs = (r.addonRows ?? []).map(
        (a) =>
          `<tr class="addon-line"><td class="iname">+ ${escapeHtml(a.name)}</td><td class="right">${a.qty}</td><td class="right">₹${Math.round(
            a.unit,
          )}</td><td class="right">₹${Math.round(a.subtotal)}</td></tr>`,
      );
      return [main, ...subs];
    })
    .join("");

  const headerLine = o.proforma
    ? `PROFORMA · ${o.fulfillmentLabel}`
    : `${o.orderRef ?? "Order"} · ${o.fulfillmentLabel}`;

  const tableLine =
    o.dineInTable?.trim() ? `<div class="muted">Table: ${escapeHtml(o.dineInTable.trim())}</div>` : "";

  const customerLine = isPosAnonymousPhoneDigits(o.phoneDigits)
    ? escapeHtml(o.customerName)
    : `${escapeHtml(o.customerName)} · +91 ${escapeHtml(o.phoneDigits)}`;

  const headerHtml = headerLines.map((l) => `<div class="pre">${escapeHtml(l)}</div>`).join("");
  const footerHtml = footerLines.map((l) => `<div class="pre">${escapeHtml(l)}</div>`).join("");

  return `
<style>${THERMAL_STYLE}</style>
<h1>${escapeHtml(o.restaurantName)}</h1>
${headerHtml}
<div class="muted">${escapeHtml(headerLine)}</div>
<div class="muted">${escapeHtml(new Date().toLocaleString("en-IN"))}</div>
${tableLine}
<div class="muted">${customerLine}</div>
${o.footerNote?.trim() ? `<div class="muted">${escapeHtml(o.footerNote.trim())}</div>` : ""}
${o.notes.trim() ? `<div class="muted">Note: ${escapeHtml(o.notes.trim())}</div>` : ""}
<table>
<thead><tr><th>Item</th><th class="right">Qty</th><th class="right">₹</th><th class="right">₹</th></tr></thead>
<tbody>${rows}</tbody>
</table>
${(() => {
  const itemsSub =
    o.itemsSubtotal ??
    o.lines.reduce((s, r) => s + r.subtotal, 0);
  const parts: string[] = [];
  if (itemsSub > 0 && (o.deliveryCharge || o.discount)) {
    parts.push(`<div class="muted">Subtotal: ₹${Math.round(itemsSub)}</div>`);
  }
  if (o.deliveryCharge && o.deliveryCharge > 0) {
    parts.push(`<div class="muted">Delivery: ₹${Math.round(o.deliveryCharge)}</div>`);
  }
  if (o.discount && o.discount > 0) {
    parts.push(`<div class="muted">Discount: -₹${Math.round(o.discount)}</div>`);
  }
  return parts.join("");
})()}
<div class="sep total">Total: ₹${Math.round(o.total)}</div>
${o.paymentLabel ? `<div class="muted">Payment: ${escapeHtml(o.paymentLabel)}</div>` : ""}
${footerHtml}
<div class="muted" style="margin-top:8px;text-align:center">Thank you</div>
`;
}

export function printPosBill(options: PosBillPrintOptions): void {
  printThermalHtml(buildBillHtmlBody(options), "Bill");
}

export type PosKotPrintOptions = {
  restaurantName: string;
  billHeader: string;
  orderRef: string;
  fulfillmentLabel: string;
  dineInTable?: string;
  notes: string;
  lines: { label: string; qty: number; addonRows?: PosReceiptAddonRow[] }[];
};

export function buildKotHtmlBody(o: PosKotPrintOptions): string {
  const headerLines = splitLines(o.billHeader);
  const headerHtml = headerLines.map((l) => `<div class="pre">${escapeHtml(l)}</div>`).join("");
  const rows = o.lines
    .flatMap((r) => {
      const main = `<tr><td>${escapeHtml(r.label)}</td><td class="right">${r.qty}</td></tr>`;
      const subs = (r.addonRows ?? []).map(
        (a) =>
          `<tr class="addon-line"><td class="iname">+ ${escapeHtml(
            a.name,
          )}</td><td class="right">${a.qty}</td></tr>`,
      );
      return [main, ...subs];
    })
    .join("");
  return `
<style>${THERMAL_STYLE}</style>
<h1>KITCHEN ORDER</h1>
<div class="muted">${escapeHtml(o.restaurantName)}</div>
${headerHtml}
<div class="sep"></div>
<div class="total">${escapeHtml(o.orderRef)}</div>
<div class="muted">${escapeHtml(o.fulfillmentLabel)}</div>
${o.dineInTable?.trim() ? `<div class="muted">Table: ${escapeHtml(o.dineInTable.trim())}</div>` : ""}
<div class="muted">${escapeHtml(new Date().toLocaleString("en-IN"))}</div>
${o.notes.trim() ? `<div class="muted">Note: ${escapeHtml(o.notes.trim())}</div>` : ""}
<table>
<thead><tr><th>Item</th><th class="right">Qty</th></tr></thead>
<tbody>${rows}</tbody>
</table>
`;
}

export function printPosKot(options: PosKotPrintOptions): void {
  printThermalHtml(buildKotHtmlBody(options), "KOT");
}

async function tryDesktopSilentPrint(html: string, title: string): Promise<boolean> {
  const d = getKhaanzDesktop();
  if (!d?.printSilentHtml) return false;
  const r = await d.printSilentHtml(html, title);
  return r.ok;
}

/** Bill: silent print in Khaanz Desktop, otherwise browser print dialog. */
export async function printPosBillThermal(
  options: PosBillPrintOptions,
): Promise<void> {
  const body = buildBillHtmlBody(options);
  const doc = wrapThermalPrintDocument(body, "Bill");
  if (await tryDesktopSilentPrint(doc, "Bill")) return;
  printThermalHtml(body, "Bill");
}

/** KOT: silent print in Khaanz Desktop, otherwise browser print dialog. */
export async function printPosKotThermal(
  options: PosKotPrintOptions,
): Promise<void> {
  const body = buildKotHtmlBody(options);
  const doc = wrapThermalPrintDocument(body, "KOT");
  if (await tryDesktopSilentPrint(doc, "KOT")) return;
  printThermalHtml(body, "KOT");
}
