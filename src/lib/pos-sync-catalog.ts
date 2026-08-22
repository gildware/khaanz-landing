import { createHash } from "crypto";

import { readMenuPayload } from "@/lib/menu-repository";
import { getPrisma } from "@/lib/prisma";
import { readRestaurantSettings } from "@/lib/settings-repository";
import type { MenuPayload } from "@/types/menu-payload";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

const CATALOG_TTL_MS = 60_000;

export type PosSyncCatalog = {
  menu: MenuPayload;
  menuRevision: string;
  settings: RestaurantSettingsPayload;
  settingsRevision: string;
};

type CatalogRevisions = {
  menuRevision: string;
  settingsRevision: string;
};

let cache: { value: PosSyncCatalog; at: number } | null = null;
let lastRevisions: CatalogRevisions | null = null;

function revisionOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

function rememberRevisions(revs: CatalogRevisions): void {
  lastRevisions = revs;
}

async function readStoredRevisions(): Promise<CatalogRevisions | null> {
  try {
    const row = await getPrisma().posSyncMeta.findUnique({
      where: { id: "default" },
      select: { menuRevision: true, settingsRevision: true },
    });
    if (!row?.menuRevision || !row.settingsRevision) return null;
    return { menuRevision: row.menuRevision, settingsRevision: row.settingsRevision };
  } catch {
    return null;
  }
}

async function writeStoredRevisions(revs: CatalogRevisions): Promise<void> {
  try {
    await getPrisma().posSyncMeta.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        menuRevision: revs.menuRevision,
        settingsRevision: revs.settingsRevision,
      },
      update: {
        menuRevision: revs.menuRevision,
        settingsRevision: revs.settingsRevision,
      },
    });
  } catch {
    /* table may not exist until migrate */
  }
}

export function invalidatePosSyncCatalogCache(): void {
  cache = null;
  lastRevisions = null;
  void getPrisma()
    .posSyncMeta.deleteMany({ where: { id: "default" } })
    .catch(() => {});
  void import("@/lib/pos-realtime").then((m) =>
    m.publishPosRealtime({ type: "catalog" }),
  );
}

/** True when stored (memory or DB) hashes match what the POS already has. */
export async function clientHasCurrentCatalog(
  menuRevision: string,
  settingsRevision: string,
): Promise<boolean> {
  if (!menuRevision || !settingsRevision) return false;
  if (
    lastRevisions &&
    lastRevisions.menuRevision === menuRevision &&
    lastRevisions.settingsRevision === settingsRevision
  ) {
    return true;
  }
  const stored = await readStoredRevisions();
  if (!stored) return false;
  rememberRevisions(stored);
  return (
    stored.menuRevision === menuRevision && stored.settingsRevision === settingsRevision
  );
}

export async function readPosSyncCatalog(): Promise<PosSyncCatalog> {
  if (cache && Date.now() - cache.at < CATALOG_TTL_MS) {
    return cache.value;
  }
  const [menu, settings] = await Promise.all([
    readMenuPayload(),
    readRestaurantSettings(),
  ]);
  const value: PosSyncCatalog = {
    menu,
    menuRevision: revisionOf(menu),
    settings,
    settingsRevision: revisionOf(settings),
  };
  cache = { value, at: Date.now() };
  rememberRevisions({
    menuRevision: value.menuRevision,
    settingsRevision: value.settingsRevision,
  });
  void writeStoredRevisions(lastRevisions!);
  return value;
}
