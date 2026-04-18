/**
 * pdf-lib Standard 14 fonts only encode WinAnsi. Passing Devanagari, emoji, or
 * ₹ often throws at drawText time. Map common cases and replace the rest.
 */
export function toPdfSafeText(input: string): string {
  const s = input
    .replace(/\u20b9/g, "Rs.")
    .replace(/\u00d7|\u2715|\u2716/g, "x")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00a0/g, " ");

  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // Printable ASCII
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
      continue;
    }
    // Latin-1 supplement (common accented letters, £, etc.)
    if (code >= 0xa0 && code <= 0xff) {
      out += ch;
      continue;
    }
    out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}
