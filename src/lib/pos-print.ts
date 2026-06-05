import type { BillPrintLayout } from "@/lib/bill-preview-settings";
import { getKhaanzDesktop } from "@/lib/khaanz-desktop-client";
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

  const content = /^\s*<!DOCTYPE/i.test(html)
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body>${html}</body></html>`;

  doc.open();
  doc.write(content);
  doc.close();

  if (doc.readyState === "complete") {
    window.requestAnimationFrame(runPrint);
  }
}

function buildThermalStyle(layout?: BillPrintLayout): string {
  const family = layout?.fontFamilyCss ?? 'Arial, Helvetica, "Liberation Sans", sans-serif';
  const weight = layout?.fontWeightCss ?? "700";
  const weightNum = layout?.fontWeightNum ?? 700;
  const logoW = layout?.logoMaxWidthMm ?? 72;
  const logoH = layout?.logoMaxHeightMm ?? 45;
  const shopSize = layout?.shopNameSizePx ?? 15;
  const grandSize = layout?.grandTotalSizePx ?? 18;
  const bodySize = layout?.bodySizePx ?? 12;
  const lineHeight = layout?.lineHeight ?? 1.4;
  const pad = layout?.receiptPaddingPx ?? 8;
  const align = layout?.headerAlign ?? "center";
  const r = ".thermal-receipt-root";
  return `
  @page { size: 80mm auto; margin: 3mm; }
  html { color-scheme: light only; }
  body.thermal-print-body { margin: 0; padding: 0; background: #fff; }
  ${r} {
    box-sizing: border-box;
    font-family: ${family};
    font-size: ${bodySize}px;
    font-weight: ${weight};
    line-height: ${lineHeight};
    margin: 0;
    padding: ${pad}px;
    max-width: 72mm;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  ${r} * {
    box-sizing: border-box;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  ${r} .bill-receipt { width: 100%; }
  ${r} .logo-wrap { text-align: center; margin: 0 auto 4px; width: 100%; }
  ${r} .logo-wrap img.logo {
    display: block;
    margin-left: auto;
    margin-right: auto;
    max-width: ${logoW}mm;
    max-height: ${logoH}mm;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center center;
    filter: grayscale(100%) contrast(1.12);
  }
  ${r} img { filter: grayscale(100%) contrast(1.08); }
  ${r} h1.shop-name { font-size: ${shopSize}px; margin: 0 0 4px; font-weight: ${weightNum + 100}; text-align: ${align}; }
  ${r} .rest-address { text-align: ${align}; font-size: 10px; margin: 0 0 4px; line-height: 1.35; white-space: pre-wrap; }
  ${r} .contact { text-align: ${align}; font-size: 11px; margin: 0 0 6px; line-height: 1.35; }
  ${r} .rule { border: none; border-top: 1px solid #000; margin: 6px 0; }
  ${r} .rule.rule-double { border-top: 3px double #000; }
  ${r} .rule.rule-dashed { border-top: 1px dashed #000; }
  ${r} .cust { font-size: 11px; margin: 2px 0; }
  ${r} .meta-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11px; margin: 2px 0; }
  ${r} .meta-row .fulfill { font-weight: ${weightNum + 100}; font-size: 12px; }
  ${r} .time-line { font-size: 11px; margin: 0 0 4px; }
  ${r} .pre { white-space: pre-wrap; font-size: 11px; margin: 4px 0; text-align: center; }
  ${r} .muted { font-size: 11px; margin: 3px 0; }
  ${r} table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  ${r} th, ${r} td { padding: 2px 0; text-align: left; vertical-align: top; font-size: 11px; }
  ${r} th { border-bottom: 1px solid #000; font-weight: ${weightNum}; }
  ${r} .right { text-align: right; white-space: nowrap; }
  ${r} .totals-row { display: flex; justify-content: space-between; font-size: 11px; margin: 4px 0; }
  ${r} .grand-total { display: flex; justify-content: space-between; align-items: baseline; font-size: ${grandSize}px; font-weight: ${weightNum + 100}; margin: 8px 0 4px; }
  ${r} .payment-status { font-size: 11px; margin: 4px 0; }
  ${r} tr.addon-line td { font-size: 10px; line-height: 1.3; }
  ${r} tr.addon-line .iname { padding-left: 8px; }
  ${r} h1 { font-size: 16px; margin: 0 0 8px; text-align: center; }
  ${r} .sep { border-top: 2px solid #000; margin: 8px 0; padding-top: 6px; }
  ${r} .total { font-size: 14px; font-weight: ${weightNum + 100}; }
`;
}

function ordinalDay(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatBillDateTime(d: Date): string {
  const day = ordinalDay(d.getDate());
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  const time = d
    .toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase()
    .replace(/\s/g, " ");
  return `${day} ${month} ${year} ${time}`;
}

export const BILL_PREVIEW_SAMPLE_AT = new Date(2026, 5, 3, 23, 20);

function extractBillNumber(orderRef: string | null): string {
  if (!orderRef) return "—";
  const m = orderRef.match(/(\d+)\s*$/);
  return m ? m[1]! : orderRef;
}

function formatOrderIdForBill(orderRef: string | null, layout?: BillPrintLayout): string {
  if (!orderRef) return "—";
  if (layout?.orderIdFormat === "full") return orderRef;
  return extractBillNumber(orderRef);
}

function thermalRuleClass(layout?: BillPrintLayout): string {
  const style = layout?.ruleStyle ?? "single";
  if (style === "double") return "rule rule-double";
  if (style === "dashed") return "rule rule-dashed";
  return "rule";
}

function parseCustomerAddress(footerNote?: string, notes?: string): string {
  const fromFooter = (footerNote ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^address:\s*/i.test(l));
  if (fromFooter) return fromFooter.replace(/^address:\s*/i, "").trim();
  return "";
}

function customerMobileForBill(phoneDigits: string): string {
  if (!phoneDigits || phoneDigits === "0000000000" || phoneDigits === "6000000000") return "";
  const d = phoneDigits.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

export function wrapThermalPrintDocument(
  bodyHtml: string,
  title: string,
  layout?: BillPrintLayout,
): string {
  const safeTitle = escapeHtml(title || "Receipt");
  const inner = bodyHtml.replace(/<style>[\s\S]*?<\/style>/gi, "").trim();
  const body = inner.includes("thermal-receipt-root")
    ? inner
    : `<div class="thermal-receipt-root">${inner}</div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="color-scheme" content="light only"/><title>${safeTitle}</title><style>${buildThermalStyle(layout)}</style></head><body class="thermal-print-body">${body}</body></html>`;
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
  customerAddress?: string;
  paymentLabel: string;
  lines: PosReceiptLine[];
  total: number;
  itemsSubtotal?: number;
  deliveryCharge?: number;
  discount?: number;
  printedAt?: Date;
  layout?: BillPrintLayout;
};

export type PosKotPrintOptions = {
  restaurantName: string;
  billHeader: string;
  orderRef: string;
  fulfillmentLabel: string;
  dineInTable?: string;
  notes: string;
  lines: { label: string; qty: number; addonRows?: PosReceiptAddonRow[] }[];
  layout?: BillPrintLayout;
};

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
}

function billDisplayName(o: PosBillPrintOptions): string {
  return o.layout?.restaurantDisplayName?.trim() || o.restaurantName.trim() || "Khaanz";
}

export function buildBillHtmlBody(o: PosBillPrintOptions): string {
  const layout = o.layout;
  const style = buildThermalStyle(layout);
  const headerLines = splitLines(o.billHeader);
  const now = o.printedAt ?? new Date();
  const rows = o.lines
    .flatMap((r) => {
      const main = `<tr><td>${escapeHtml(r.label)}</td><td class="right">${r.qty}</td><td class="right">${r.unit.toFixed(
        2,
      )}</td><td class="right">${r.subtotal.toFixed(2)}</td></tr>`;
      const subs = (r.addonRows ?? []).map(
        (a) =>
          `<tr class="addon-line"><td class="iname">+ ${escapeHtml(a.name)}</td><td class="right">${a.qty}</td><td class="right">${a.unit.toFixed(
            2,
          )}</td><td class="right">${a.subtotal.toFixed(2)}</td></tr>`,
      );
      return [main, ...subs];
    })
    .join("");

  const mobile = customerMobileForBill(o.phoneDigits);
  const nameLine = mobile
    ? `Name: (M: ${mobile})`
    : `Name: ${o.customerName}`;
  const addr =
    (o.customerAddress ?? "").trim() || parseCustomerAddress(o.footerNote, o.notes);
  const addrLine = addr ? `<div class="cust">Adr: ${escapeHtml(addr)}</div>` : "";
  const tableLine = o.dineInTable?.trim()
    ? `<div class="cust">Table: ${escapeHtml(o.dineInTable.trim())}</div>`
    : "";

  const headerHtml = headerLines.map((l) => `<div class="pre">${escapeHtml(l)}</div>`).join("");
  const customFooterHtml =
    layout?.showFooterNotes !== false
      ? splitLines(layout?.footerNotes ?? "")
          .map((l) => `<div class="pre">${escapeHtml(l)}</div>`)
          .join("")
      : "";

  const logoSrc = layout?.logoSrc?.trim() ?? "";
  const logoHtml =
    layout?.showLogo !== false && logoSrc
      ? `<div class="logo-wrap"><img class="logo" src="${escapeHtml(logoSrc)}" alt="" /></div>`
      : "";

  const restPhone = layout?.restaurantPhone?.trim() ?? "";
  const restAddr = layout?.restaurantAddress?.trim() ?? "";
  const addressHtml =
    layout?.showAddress !== false && restAddr
      ? `<div class="rest-address">${escapeHtml(restAddr)}</div>`
      : "";
  const contactHtml =
    layout?.showPhone !== false && restPhone
      ? `<div class="contact">${escapeHtml(layout?.contactLabel ?? "Tel:")} ${escapeHtml(restPhone)}</div>`
      : "";
  const nameHtml =
    layout?.showRestaurantName !== false
      ? `<h1 class="shop-name">${escapeHtml(billDisplayName(o))}</h1>`
      : "";

  const itemsSub = o.itemsSubtotal ?? o.lines.reduce((s, r) => s + r.subtotal, 0);
  const totalQty = o.lines.reduce((s, r) => s + r.qty, 0);
  const extraTotals: string[] = [];
  if (o.deliveryCharge && o.deliveryCharge > 0) {
    extraTotals.push(
      `<div class="totals-row"><span>Delivery</span><span>${o.deliveryCharge.toFixed(2)}</span></div>`,
    );
  }
  if (o.discount && o.discount > 0) {
    extraTotals.push(
      `<div class="totals-row"><span>Discount</span><span>-${o.discount.toFixed(2)}</span></div>`,
    );
  }

  const payStatus = o.paymentLabel?.trim()
    ? o.paymentLabel.trim()
    : (layout?.unpaidLabel ?? "Not Paid");
  const orderId = formatOrderIdForBill(o.orderRef, layout);
  const proformaLine = o.proforma ? `<div class="cust">PROFORMA</div>` : "";
  const rule = thermalRuleClass(layout);
  const themeClass = layout?.themeClass ?? "bill-theme-classic";
  const metaOrderHtml =
    layout?.showOrderId !== false
      ? `<div class="meta-row"><span class="fulfill">${escapeHtml(o.fulfillmentLabel)}</span><span>${escapeHtml(layout?.orderIdLabel ?? "Bill No.")}: ${escapeHtml(orderId)}</span></div>`
      : `<div class="meta-row"><span class="fulfill">${escapeHtml(o.fulfillmentLabel)}</span></div>`;

  return `
<style>${style}</style>
<div class="bill-receipt ${themeClass}">
${logoHtml}
${nameHtml}
${addressHtml}
${contactHtml}
${headerHtml}
<hr class="${rule}"/>
<div class="cust">${escapeHtml(nameLine)}</div>
${addrLine}
${tableLine}
<hr class="${rule}"/>
${metaOrderHtml}
<div class="time-line">${escapeHtml(formatBillDateTime(now))}</div>
${proformaLine}
<hr class="${rule}"/>
<table>
<thead><tr><th>Item</th><th class="right">Qty.</th><th class="right">Price</th><th class="right">Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<hr class="${rule}"/>
<div class="totals-row"><span>Total Qty: ${totalQty}</span><span>Sub Total ${itemsSub.toFixed(2)}</span></div>
${extraTotals.join("")}
<hr class="${rule}"/>
<div class="grand-total"><span>Grand Total</span><span>₹${o.total.toFixed(2)}</span></div>
<div class="payment-status">${escapeHtml(payStatus)}</div>
${customFooterHtml}
${o.notes.trim() ? `<div class="muted">Note: ${escapeHtml(o.notes.trim())}</div>` : ""}
</div>
`;
}

export function printPosBill(options: PosBillPrintOptions): void {
  const body = buildBillHtmlBody(options);
  printThermalHtml(wrapThermalPrintDocument(body, "Bill", options.layout), "Bill");
}

export function buildKotHtmlBody(o: PosKotPrintOptions): string {
  const style = buildThermalStyle(o.layout);
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
<style>${style}</style>
<h1>KITCHEN ORDER</h1>
<div class="muted">${escapeHtml(o.restaurantName)}</div>
${headerHtml}
<div class="sep"></div>
<div class="total">${escapeHtml(o.orderRef)}</div>
<div class="muted">${escapeHtml(o.fulfillmentLabel)}</div>
${o.dineInTable?.trim() ? `<div class="muted">Table: ${escapeHtml(o.dineInTable.trim())}</div>` : ""}
<div class="muted">${escapeHtml(formatBillDateTime(new Date()))}</div>
${o.notes.trim() ? `<div class="muted">Note: ${escapeHtml(o.notes.trim())}</div>` : ""}
<table>
<thead><tr><th>Item</th><th class="right">Qty</th></tr></thead>
<tbody>${rows}</tbody>
</table>
`;
}

export function printPosKot(options: PosKotPrintOptions): void {
  const body = buildKotHtmlBody(options);
  printThermalHtml(wrapThermalPrintDocument(body, "KOT", options.layout), "KOT");
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
  const doc = wrapThermalPrintDocument(body, "Bill", options.layout);
  if (await tryDesktopSilentPrint(doc, "Bill")) return;
  printThermalHtml(doc, "Bill");
}

/** KOT: silent print in Khaanz Desktop, otherwise browser print dialog. */
export async function printPosKotThermal(
  options: PosKotPrintOptions,
): Promise<void> {
  const body = buildKotHtmlBody(options);
  const doc = wrapThermalPrintDocument(body, "KOT", options.layout);
  if (await tryDesktopSilentPrint(doc, "KOT")) return;
  printThermalHtml(doc, "KOT");
}

/** Full HTML document for Settings preview (iframe — styles must not leak into the app). */
export function buildBillPreviewDocument(options: PosBillPrintOptions): string {
  const body = buildBillHtmlBody(options).replace(/<style>[\s\S]*?<\/style>/gi, "");
  return wrapThermalPrintDocument(body, "Bill preview", options.layout);
}

export function buildKotPreviewDocument(options: PosKotPrintOptions): string {
  const body = buildKotHtmlBody(options).replace(/<style>[\s\S]*?<\/style>/gi, "");
  return wrapThermalPrintDocument(body, "KOT preview", options.layout);
}

export type BillPreviewFulfillment = "dine_in" | "pickup" | "delivery";

const BILL_PREVIEW_SAMPLE_LINES: PosReceiptLine[] = [
  { label: "Veg. Chowmein (Half)", qty: 1, unit: 90, subtotal: 90 },
  { label: "Chicken Feast Pizza (Regular)", qty: 1, unit: 280, subtotal: 280 },
];

export function buildBillPreviewSampleOptions(
  restaurantName: string,
  layout: BillPrintLayout,
  fulfillment: BillPreviewFulfillment = "delivery",
): PosBillPrintOptions {
  const base = {
    restaurantName: layout.restaurantDisplayName.trim() || restaurantName.trim() || "Khaanz",
    billHeader: "",
    billFooter: "",
    orderRef: "ORD-3516",
    proforma: false,
    notes: "",
    paymentLabel: "",
    lines: BILL_PREVIEW_SAMPLE_LINES,
    total: 370,
    printedAt: BILL_PREVIEW_SAMPLE_AT,
    layout,
  };

  if (fulfillment === "dine_in") {
    return {
      ...base,
      fulfillmentLabel: "Dine-in",
      dineInTable: "T-5",
      customerName: "Guest",
      phoneDigits: "",
    };
  }

  if (fulfillment === "pickup") {
    return {
      ...base,
      fulfillmentLabel: "Pickup",
      customerName: "Guest",
      phoneDigits: "7889762589",
    };
  }

  return {
    ...base,
    fulfillmentLabel: "Delivery",
    customerName: "Guest",
    phoneDigits: "7889762589",
    customerAddress: "Near Mufti House",
  };
}

export function buildKotPreviewSampleOptions(
  restaurantName: string,
  layout: BillPrintLayout,
  fulfillment: BillPreviewFulfillment = "delivery",
): PosKotPrintOptions {
  const bill = buildBillPreviewSampleOptions(restaurantName, layout, fulfillment);
  return {
    restaurantName: bill.restaurantName,
    billHeader: bill.billHeader,
    orderRef: bill.orderRef ?? "3516",
    fulfillmentLabel: bill.fulfillmentLabel,
    dineInTable: bill.dineInTable,
    notes: "Sample kitchen note",
    lines: bill.lines.map((r) => ({
      label: r.label,
      qty: r.qty,
      addonRows: r.addonRows,
    })),
    layout,
  };
}
