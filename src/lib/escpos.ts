/**
 * Minimal ESC/POS helpers for common USB thermal printers (58/80mm).
 * Uses UTF-8 — many printers need code page; we ASCII-fallback for reliability.
 */

const ESC = 0x1b;
const GS = 0x1d;

function toAsciiLine(s: string): string {
  return s
    .replace(/₹/g, "Rs.")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

export function escPosInit(): Uint8Array {
  return new Uint8Array([ESC, 0x40]);
}

/** LF line breaks */
export function escPosTextLine(s: string): Uint8Array {
  const line = toAsciiLine(s) + "\n";
  return new TextEncoder().encode(line);
}

export function escPosSeparator(char = "-", width = 32): Uint8Array {
  return escPosTextLine(char.repeat(Math.min(width, 48)));
}

/** Partial cut + feed (common TM/Star-compatible) */
export function escPosCut(): Uint8Array {
  return new Uint8Array([GS, 0x56, 0x41, 0x03]);
}

export function concatEscPos(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export type EscPosBillInput = {
  restaurantName: string;
  billHeaderLines: string[];
  billFooterLines: string[];
  orderRef: string;
  proforma: boolean;
  fulfillmentLabel: string;
  customerLine: string;
  addressBlock: string;
  notes: string;
  lines: {
    label: string;
    qty: number;
    unit: number;
    subtotal: number;
    addonRows?: {
      name: string;
      qty: number;
      unit: number;
      subtotal: number;
    }[];
  }[];
  total: number;
  paymentLabel: string;
};

export function buildEscPosBill(input: EscPosBillInput): Uint8Array {
  const parts: Uint8Array[] = [escPosInit()];
  parts.push(escPosTextLine(input.restaurantName));
  for (const line of input.billHeaderLines) {
    if (line.trim()) parts.push(escPosTextLine(line));
  }
  parts.push(escPosSeparator());
  parts.push(
    escPosTextLine(
      input.proforma
        ? `PROFORMA · ${input.fulfillmentLabel}`
        : `${input.orderRef} · ${input.fulfillmentLabel}`,
    ),
  );
  parts.push(escPosTextLine(new Date().toLocaleString("en-IN")));
  parts.push(escPosTextLine(input.customerLine));
  if (input.addressBlock.trim()) {
    for (const ln of input.addressBlock.split("\n")) {
      if (ln.trim()) parts.push(escPosTextLine(ln));
    }
  }
  if (input.notes.trim()) {
    parts.push(escPosTextLine(`Note: ${input.notes.trim()}`));
  }
  parts.push(escPosSeparator());
  parts.push(escPosTextLine("Item                    Qty  Each  Amt"));
  parts.push(escPosSeparator("-", 42));
  for (const r of input.lines) {
    const sub = Math.round(r.subtotal);
    const unit = Math.round(r.unit);
    const lbl = toAsciiLine(r.label).slice(0, 28);
    parts.push(
      escPosTextLine(
        `${lbl.padEnd(28)} ${String(r.qty).padStart(2)} ${String(unit).padStart(5)} ${String(sub).padStart(5)}`,
      ),
    );
    for (const a of r.addonRows ?? []) {
      const an = toAsciiLine(`+ ${a.name}`).slice(0, 22);
      const q = a.qty;
      const u = Math.round(a.unit);
      const st = Math.round(a.subtotal);
      parts.push(
        escPosTextLine(
          `  ${an.padEnd(24)} ${String(q).padStart(2)} ${String(u).padStart(5)} ${String(st).padStart(5)}`,
        ),
      );
    }
  }
  parts.push(escPosSeparator());
  parts.push(escPosTextLine(`TOTAL: Rs.${Math.round(input.total)}`));
  if (input.paymentLabel) {
    parts.push(escPosTextLine(`Payment: ${toAsciiLine(input.paymentLabel)}`));
  }
  for (const line of input.billFooterLines) {
    if (line.trim()) parts.push(escPosTextLine(line));
  }
  parts.push(escPosTextLine("Thank you"));
  parts.push(escPosCut());
  return concatEscPos(parts);
}

export type EscPosKotInput = {
  restaurantName: string;
  headerLines: string[];
  orderRef: string;
  fulfillmentLabel: string;
  notes: string;
  lines: {
    label: string;
    qty: number;
    addonRows?: {
      name: string;
      qty: number;
      unit: number;
      subtotal: number;
    }[];
  }[];
};

export function buildEscPosKot(input: EscPosKotInput): Uint8Array {
  const parts: Uint8Array[] = [escPosInit()];
  parts.push(escPosTextLine("*** KITCHEN ORDER ***"));
  parts.push(escPosTextLine(input.restaurantName));
  for (const line of input.headerLines) {
    if (line.trim()) parts.push(escPosTextLine(line));
  }
  parts.push(escPosSeparator());
  parts.push(escPosTextLine(input.orderRef));
  parts.push(escPosTextLine(input.fulfillmentLabel));
  parts.push(escPosTextLine(new Date().toLocaleString("en-IN")));
  if (input.notes.trim()) {
    parts.push(escPosTextLine(`NOTE: ${toAsciiLine(input.notes.trim())}`));
  }
  parts.push(escPosSeparator());
  for (const r of input.lines) {
    const lbl = toAsciiLine(r.label).slice(0, 36);
    parts.push(escPosTextLine(`${String(r.qty)}x ${lbl}`));
    for (const a of r.addonRows ?? []) {
      const an = toAsciiLine(a.name).slice(0, 28);
      const q = a.qty;
      parts.push(escPosTextLine(`   + ${q}x ${an}`));
    }
  }
  parts.push(escPosSeparator());
  parts.push(escPosCut());
  return concatEscPos(parts);
}
