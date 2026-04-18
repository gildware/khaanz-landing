import type { MenuPayload } from "@/types/menu-payload";

export async function persistMenuPayload(payload: MenuPayload): Promise<void> {
  const res = await fetch("/api/admin/menu", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
