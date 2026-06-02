import type { MenuPayload } from "@/types/menu-payload";

async function putJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    let msg = "Save failed";
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function persistMenuPayload(payload: MenuPayload): Promise<void> {
  await putJson("/api/admin/menu", payload);
}

/**
 * Reorder categories/items and toggle item visibility without rewriting the
 * whole menu (safe when items are referenced by wastage, recipes, etc.).
 */
export async function persistMenuLayout(layout: {
  categories: string[];
  items: { id: string; available: boolean }[];
}): Promise<void> {
  await putJson("/api/admin/menu/layout", layout);
}
