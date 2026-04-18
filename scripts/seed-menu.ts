/**
 * Creates data/menu.json from bundled defaults if missing.
 * Run: npx tsx scripts/seed-menu.ts
 */
import { ensureMenuFileFromDefaults } from "../src/lib/menu-repository";

void ensureMenuFileFromDefaults().then(() => {
  console.log("data/menu.json is ready.");
});
