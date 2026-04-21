/** Stable id segment from a display name (used for category primary keys). */
export function slugifyCategoryName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "category";
}

/** Assign unique ids for a list of category names (order preserved). */
export function uniqueCategoryIds(names: string[]): { id: string; name: string }[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugifyCategoryName(name);
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n++}`;
    }
    used.add(id);
    return { id, name };
  });
}
