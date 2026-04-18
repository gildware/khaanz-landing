import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

import { getDefaultMenuPayload } from "@/data/menu";
import type { MenuPayload } from "@/types/menu-payload";

const FILE = join(process.cwd(), "data", "menu.json");

function isPayload(x: unknown): x is MenuPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Array.isArray(o.categories) &&
    Array.isArray(o.globalAddons) &&
    Array.isArray(o.items)
  );
}

export async function readMenuPayload(): Promise<MenuPayload> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isPayload(parsed)) {
      return getDefaultMenuPayload();
    }
    return parsed;
  } catch {
    return getDefaultMenuPayload();
  }
}

export async function writeMenuPayload(payload: MenuPayload): Promise<void> {
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(FILE, text, "utf-8");
}

export async function ensureMenuFileFromDefaults(): Promise<void> {
  try {
    await readFile(FILE, "utf-8");
  } catch {
    await writeMenuPayload(getDefaultMenuPayload());
  }
}
