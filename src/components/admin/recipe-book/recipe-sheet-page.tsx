import type { RecipeExportSheet } from "@/lib/inventory/recipe-export-types";

import styles from "./recipe-sheet.module.css";

type RecipeSheetPageProps = {
  recipe: RecipeExportSheet;
  exportedAtLabel: string;
  pageNum: number;
  totalPages: number;
};

function typeLabel(kind: "stock" | "prep"): string {
  return kind === "prep" ? "Prep item" : "Stock";
}

export function RecipeSheetPage({
  recipe,
  exportedAtLabel,
  pageNum,
  totalPages,
}: RecipeSheetPageProps) {
  const stockCount = recipe.ingredients.filter((i) => i.kind === "stock").length;
  const prepCount = recipe.ingredients.filter((i) => i.kind === "prep").length;

  return (
    <article className={styles.recipePage}>
      <div className={styles.pageAccent} aria-hidden />
      <div className={styles.pageInner}>
        <header className={styles.pageHeader}>
          <div className={styles.brandBlock}>
            <div className={styles.brandMark} aria-hidden>
              K
            </div>
            <div>
              <div className={styles.brandName}>Khaanz Kitchen</div>
              <div className={styles.brandTagline}>Recipe sheet · internal use</div>
            </div>
          </div>
          <div className={styles.docMeta}>
            Exported <strong>{exportedAtLabel}</strong>
            <br />
            Page <strong>{pageNum}</strong> of <strong>{totalPages}</strong>
          </div>
        </header>

        <div className={styles.titleBlock}>
          <div className={styles.categoryPill}>{recipe.categoryName}</div>
          <h1 className={styles.dishTitle}>{recipe.menuItemName}</h1>
          <p className={styles.dishSubtitle}>{recipe.label}</p>
        </div>

        <div className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Variation</div>
            <div className={styles.infoValue}>{recipe.variationName}</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Version</div>
            <div className={styles.infoValue}>v{recipe.version}</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Effective from</div>
            <div className={styles.infoValueSmall}>{recipe.effectiveFromLabel}</div>
          </div>
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>Yield</div>
            <div className={styles.infoValue}>
              {recipe.yieldQty} {recipe.yieldUnit}
            </div>
          </div>
        </div>

        <div className={styles.sectionTitle}>
          <h2>Ingredients</h2>
          <span className={styles.sectionMeta}>
            {recipe.ingredients.length} lines · {stockCount} stock · {prepCount} prep
          </span>
        </div>

        <table className={styles.ingredientsTable}>
          <thead>
            <tr>
              <th style={{ width: "18%" }}>Type</th>
              <th style={{ width: "46%" }}>Item</th>
              <th style={{ width: "18%" }}>Qty</th>
              <th style={{ width: "18%" }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {recipe.ingredients.map((ing, index) => (
              <tr key={`${ing.name}-${index}`}>
                <td>
                  <span
                    className={
                      ing.kind === "prep" ? styles.typeBadgePrep : styles.typeBadgeStock
                    }
                  >
                    {typeLabel(ing.kind)}
                  </span>
                </td>
                <td>
                  <span className={styles.ingredientName}>{ing.name}</span>
                </td>
                <td className={styles.qtyCell}>{ing.qty}</td>
                <td className={styles.unitCell}>{ing.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className={styles.pageFooter}>
          <span className={styles.confidential}>Confidential · kitchen staff only</span>
          <span>
            {recipe.menuItemName} · {recipe.variationName} · v{recipe.version}
          </span>
        </footer>
      </div>
    </article>
  );
}
