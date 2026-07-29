/**
 * Generates a standalone printable menu board HTML from default menu data.
 * Run: npx tsx scripts/generate-menu-html.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { getDefaultMenuPayload } from "../src/data/menu";
import { buildMenuBoardHtml } from "../src/lib/menu-board-html";

const OUT = join(process.cwd(), "samples", "menu-board.html");

function main() {
  const payload = getDefaultMenuPayload();
  const html = buildMenuBoardHtml(payload);
  writeFileSync(OUT, html, "utf8");

  const itemCount = payload.items.filter(
    (i) => !i.notForSale && i.available !== false,
  ).length;
  console.log(`Wrote ${OUT} (${itemCount} items, ${payload.combos.length} combos)`);
}

main();
