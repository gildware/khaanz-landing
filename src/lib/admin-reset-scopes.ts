/** Keys for selective admin data reset (POST /api/admin/reset-data). */
export const ADMIN_RESET_SCOPE_KEYS = [
  "orders",
  "menu",
  "restoreDefaultMenu",
  "stockQuantities",
  "inventoryHistory",
  "suppliers",
  "vendors",
  "payroll",
  "expenses",
  "personalUse",
  "restaurantDefaults",
] as const;

export type AdminResetScopeKey = (typeof ADMIN_RESET_SCOPE_KEYS)[number];

export type AdminResetScopes = Record<AdminResetScopeKey, boolean>;

export const ADMIN_RESET_SCOPE_META: {
  key: AdminResetScopeKey;
  label: string;
  description: string;
  /** Shown indented under another scope in the UI. */
  dependsOn?: AdminResetScopeKey;
}[] = [
  {
    key: "orders",
    label: "Orders & customers",
    description: "All orders, order counters, OTP challenges, and customer records.",
  },
  {
    key: "menu",
    label: "Menu",
    description:
      "Categories, items, variations, add-ons, and combos. Clears menu-linked wastage and vendor sale lines first.",
  },
  {
    key: "restoreDefaultMenu",
    label: "Restore bundled default menu",
    description: "After deleting the menu, write the app’s default starter menu again.",
    dependsOn: "menu",
  },
  {
    key: "stockQuantities",
    label: "Stock quantities & cost values",
    description:
      "Keep inventory item definitions; set on-hand qty and cost fields to zero.",
  },
  {
    key: "inventoryHistory",
    label: "Inventory history",
    description:
      "Stock audits, movements, batches, adjustments, wastage, and kitchen use entries.",
  },
  {
    key: "suppliers",
    label: "Suppliers & purchases",
    description: "Suppliers, purchases, returns, payments, and supplier ledger.",
  },
  {
    key: "vendors",
    label: "Vendors",
    description: "Vendors, sales, payments, ledger, and sellable menu mappings.",
  },
  {
    key: "payroll",
    label: "Payroll & employees",
    description: "Employees, payroll runs, and related payroll lines.",
  },
  {
    key: "expenses",
    label: "Expenses",
    description: "Expense entries and expense categories.",
  },
  {
    key: "personalUse",
    label: "Personal use",
    description: "Personal use entries (cash / stock / order).",
  },
  {
    key: "restaurantDefaults",
    label: "Restaurant & inventory settings",
    description:
      "Reset hours, bill copy, payment methods, floor plan (empty), and inventory settings to a fresh install.",
  },
];

export function emptyAdminResetScopes(): AdminResetScopes {
  return {
    orders: false,
    menu: false,
    restoreDefaultMenu: false,
    stockQuantities: false,
    inventoryHistory: false,
    suppliers: false,
    vendors: false,
    payroll: false,
    expenses: false,
    personalUse: false,
    restaurantDefaults: false,
  };
}

export function allAdminResetScopes(): AdminResetScopes {
  return {
    orders: true,
    menu: true,
    restoreDefaultMenu: true,
    stockQuantities: true,
    inventoryHistory: true,
    suppliers: true,
    vendors: true,
    payroll: true,
    expenses: true,
    personalUse: true,
    restaurantDefaults: true,
  };
}

export function parseAdminResetScopes(raw: unknown): AdminResetScopes | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const scopes = emptyAdminResetScopes();
  for (const key of ADMIN_RESET_SCOPE_KEYS) {
    if (typeof obj[key] !== "boolean") return null;
    scopes[key] = obj[key];
  }
  if (scopes.restoreDefaultMenu && !scopes.menu) {
    scopes.restoreDefaultMenu = false;
  }
  return scopes;
}

/** True if at least one destructive scope is selected (ignores restoreDefaultMenu alone). */
export function hasAnyAdminResetSelection(scopes: AdminResetScopes): boolean {
  return ADMIN_RESET_SCOPE_KEYS.some(
    (key) => key !== "restoreDefaultMenu" && scopes[key],
  );
}
