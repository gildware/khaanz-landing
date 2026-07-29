/** Module and submenu permission keys for admin / staff login. */
type AdminPermissionKey =
  | "dashboard"
  | "reports"
  | "reports.overview"
  | "reports.sales"
  | "reports.items"
  | "reports.expenses"
  | "reports.personal"
  | "reports.wastage"
  | "reports.daily_report"
  | "reports.previous_sales"
  | "reports.cash"
  | "online_orders"
  | "orders"
  | "inventory"
  | "inventory.overview"
  | "inventory.items"
  | "inventory.suppliers"
  | "inventory.purchase"
  | "inventory.recipes"
  | "inventory.sell"
  | "inventory.ops"
  | "inventory.stock_usage"
  | "inventory.recipe_book"
  | "wastage"
  | "wastage.overview"
  | "wastage.reports"
  | "vendors"
  | "vendors.overview"
  | "vendors.vendors"
  | "vendors.sellable"
  | "vendors.sales"
  | "vendors.payments"
  | "expenses"
  | "expenses.business"
  | "expenses.personal"
  | "floor_plan"
  | "pos"
  | "menu"
  | "menu.categories"
  | "menu.items"
  | "menu.combos"
  | "menu.addons"
  | "menu.board"
  | "home_layout"
  | "payroll"
  | "payroll.employees"
  | "payroll.attendance"
  | "payroll.advances"
  | "payroll.payrun"
  | "settings"
  | "settings.general"
  | "settings.timing"
  | "settings.delivery"
  | "settings.bill"
  | "settings.payment"
  | "settings.desktop"
  | "staff";

export type AdminPermission = AdminPermissionKey;

export type PermissionNode = {
  key: AdminPermission;
  label: string;
  children?: PermissionNode[];
};

export const ADMIN_PERMISSION_TREE: PermissionNode[] = [
  { key: "dashboard", label: "Dashboard" },
  {
    key: "reports",
    label: "Reports",
    children: [
      { key: "reports.overview", label: "Overview" },
      { key: "reports.sales", label: "Sales" },
      { key: "reports.items", label: "Menu items" },
      { key: "reports.expenses", label: "Business expenses" },
      { key: "reports.personal", label: "Personal expenses" },
      { key: "reports.wastage", label: "Wastage" },
      { key: "reports.daily_report", label: "Daily report" },
      { key: "reports.previous_sales", label: "Previous day sales" },
      { key: "reports.cash", label: "Money available" },
    ],
  },
  { key: "online_orders", label: "Online orders" },
  { key: "orders", label: "Orders" },
  {
    key: "inventory",
    label: "Inventory",
    children: [
      { key: "inventory.overview", label: "Overview" },
      { key: "inventory.items", label: "Stock items" },
      { key: "inventory.suppliers", label: "Suppliers" },
      { key: "inventory.purchase", label: "Purchase orders" },
      { key: "inventory.recipes", label: "Recipes" },
      { key: "inventory.sell", label: "Sell / transfer" },
      { key: "inventory.ops", label: "Operations" },
      { key: "inventory.stock_usage", label: "Daily stock usage" },
      { key: "inventory.recipe_book", label: "Recipe book (page)" },
    ],
  },
  {
    key: "wastage",
    label: "Wastage",
    children: [
      { key: "wastage.overview", label: "Overview" },
      { key: "wastage.reports", label: "Reports" },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    children: [
      { key: "vendors.overview", label: "Overview" },
      { key: "vendors.vendors", label: "Vendors list" },
      { key: "vendors.sellable", label: "Sellable items" },
      { key: "vendors.sales", label: "Sales" },
      { key: "vendors.payments", label: "Payments" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    children: [
      { key: "expenses.business", label: "Business expenses" },
      { key: "expenses.personal", label: "Personal use" },
    ],
  },
  { key: "floor_plan", label: "Table layout" },
  { key: "pos", label: "POS (desktop & mobile)" },
  {
    key: "menu",
    label: "Menu",
    children: [
      { key: "menu.categories", label: "Categories" },
      { key: "menu.items", label: "Menu items" },
      { key: "menu.combos", label: "Combos" },
      { key: "menu.addons", label: "Add-ons" },
      { key: "menu.board", label: "Menu board" },
    ],
  },
  { key: "home_layout", label: "Home layout" },
  {
    key: "payroll",
    label: "Payroll",
    children: [
      { key: "payroll.employees", label: "Employees" },
      { key: "payroll.attendance", label: "Attendance" },
      { key: "payroll.advances", label: "Advance salary" },
      { key: "payroll.payrun", label: "Payroll run" },
    ],
  },
  { key: "settings", label: "Settings", children: [
      { key: "settings.general", label: "General" },
      { key: "settings.timing", label: "Timing" },
      { key: "settings.delivery", label: "Delivery" },
      { key: "settings.bill", label: "Bill settings" },
      { key: "settings.payment", label: "Payment methods" },
      { key: "settings.desktop", label: "POS app" },
    ] },
  { key: "staff", label: "Staff & logins" },
];

function flattenTree(nodes: PermissionNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.key);
    if (node.children?.length) flattenTree(node.children, out);
  }
  return out;
}

export const ADMIN_PERMISSIONS = flattenTree(ADMIN_PERMISSION_TREE) as AdminPermissionKey[];

/** Legacy top-level module keys (still accepted in stored JSON). */
export const LEGACY_MODULE_PERMISSIONS = [
  "dashboard",
  "reports",
  "online_orders",
  "orders",
  "inventory",
  "wastage",
  "vendors",
  "expenses",
  "floor_plan",
  "pos",
  "menu",
  "home_layout",
  "payroll",
  "settings",
  "staff",
] as const;

export type LegacyModulePermission = (typeof LEGACY_MODULE_PERMISSIONS)[number];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> =
  Object.fromEntries(
    ADMIN_PERMISSIONS.map((key) => {
      const find = (nodes: PermissionNode[]): string | undefined => {
        for (const n of nodes) {
          if (n.key === key) return n.label;
          if (n.children) {
            const c = find(n.children);
            if (c) return c;
          }
        }
        return undefined;
      };
      return [key, find(ADMIN_PERMISSION_TREE) ?? key];
    }),
  ) as Record<AdminPermission, string>;

/** Full access for existing admins and new full-access accounts. */
export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [...ADMIN_PERMISSIONS];

const LEGACY_MODULE_SET = new Set<string>(LEGACY_MODULE_PERMISSIONS);

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === "string" && ADMIN_PERMISSIONS.includes(value as AdminPermission);
}

/** Accept legacy module keys stored before submenu permissions existed. */
export function isStoredPermission(value: unknown): value is AdminPermission | LegacyModulePermission {
  return (
    typeof value === "string" &&
    (ADMIN_PERMISSIONS.includes(value as AdminPermission) ||
      LEGACY_MODULE_SET.has(value))
  );
}

export function parsePermissionsJson(raw: unknown): AdminPermission[] {
  if (!Array.isArray(raw)) return [];
  const out: AdminPermission[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isStoredPermission(item) || seen.has(item)) continue;
    seen.add(item);
    if (isAdminPermission(item)) {
      out.push(item);
    } else {
      // Expand legacy module key to all descendants for in-memory use
      out.push(...expandModuleToLeaves(item));
    }
  }
  return out;
}

function expandModuleToLeaves(module: LegacyModulePermission): AdminPermission[] {
  const node = findPermissionNode(module);
  if (!node) return [module as AdminPermission];
  if (!node.children?.length) return [node.key];
  return flattenTree(node.children) as AdminPermission[];
}

function findPermissionNode(key: string): PermissionNode | undefined {
  const walk = (nodes: PermissionNode[]): PermissionNode | undefined => {
    for (const n of nodes) {
      if (n.key === key) return n;
      if (n.children) {
        const found = walk(n.children);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(ADMIN_PERMISSION_TREE);
}

/** Parent keys for a permission, e.g. reports.sales → [reports]. */
export function permissionAncestors(permission: string): string[] {
  const parts = permission.split(".");
  const ancestors: string[] = [];
  for (let i = parts.length - 1; i > 0; i--) {
    ancestors.push(parts.slice(0, i).join("."));
  }
  return ancestors;
}

/** Module root for a permission, e.g. reports.sales → reports. */
export function permissionModule(permission: string): string {
  return permission.split(".")[0] ?? permission;
}

export function normalizePermissionsInput(raw: unknown): AdminPermission[] {
  return compactPermissions(parsePermissionsJson(raw));
}

/**
 * Collapse fully-selected sibling groups to a parent key where possible
 * so stored JSON stays compact for “all access within a module”.
 */
export function compactPermissions(permissions: AdminPermission[]): AdminPermission[] {
  const set = new Set(permissions);
  const compactNode = (node: PermissionNode): void => {
    if (!node.children?.length) return;
    for (const child of node.children) compactNode(child);
    const allChildrenSelected = node.children.every((c) => set.has(c.key));
    if (allChildrenSelected) {
      for (const child of node.children) set.delete(child.key);
      set.add(node.key);
    }
  };
  for (const root of ADMIN_PERMISSION_TREE) compactNode(root);
  return ADMIN_PERMISSIONS.filter((p) => set.has(p));
}

export type PermissionBearer = {
  role: string;
  permissions: AdminPermission[];
};

function grantedSet(bearer: PermissionBearer): Set<string> {
  return new Set(bearer.permissions);
}

/**
 * True when `permission` is explicitly granted, granted via a parent key,
 * or covered by a legacy module key expanded at parse time.
 */
export function hasPermission(
  bearer: PermissionBearer | null | undefined,
  permission: AdminPermission,
): boolean {
  if (!bearer) return false;
  if (bearer.role === "SUPER_ADMIN") return true;
  if (bearer.role === "ADMIN" && bearer.permissions.length === 0) return true;

  const granted = grantedSet(bearer);
  if (granted.has(permission)) return true;

  for (const ancestor of permissionAncestors(permission)) {
    if (granted.has(ancestor)) return true;
  }

  return false;
}

export function hasAnyPermission(
  bearer: PermissionBearer | null | undefined,
  permissions: AdminPermission[],
): boolean {
  return permissions.some((p) => hasPermission(bearer, p));
}

/** Expand stored permissions for display in the staff editor (parents → all children checked). */
export function expandPermissionsForEditor(
  permissions: AdminPermission[],
): AdminPermission[] {
  const set = new Set<AdminPermission>();
  for (const p of permissions) {
    const node = findPermissionNode(p);
    if (node?.children?.length) {
      for (const leaf of flattenTree(node.children) as AdminPermission[]) set.add(leaf);
    } else {
      set.add(p);
    }
  }
  return ADMIN_PERMISSIONS.filter((p) => set.has(p));
}

export function leafPermissionsUnder(node: PermissionNode): AdminPermission[] {
  if (!node.children?.length) return [node.key];
  return flattenTree(node.children) as AdminPermission[];
}

/**
 * Every submenu key inside a module. API rules use this so adding a submenu to
 * the tree never leaves an endpoint silently rejecting it.
 */
export function moduleLeafPermissions(
  module: AdminPermission,
): AdminPermission[] {
  const node = findPermissionNode(module);
  return node ? leafPermissionsUnder(node) : [module];
}

/** First panel home the user can open after login. */
export function defaultAdminHomePath(
  bearer: PermissionBearer,
  options?: { preferMobile?: boolean },
): string {
  if (options?.preferMobile && hasPermission(bearer, "pos")) {
    return "/admin/pos/mobile";
  }
  const order: { permission: AdminPermission; href: string }[] = [
    { permission: "dashboard", href: "/admin/dashboard" },
    { permission: "online_orders", href: "/admin/online-orders" },
    { permission: "orders", href: "/admin/orders" },
    { permission: "pos", href: "/admin/pos" },
    { permission: "inventory.items", href: "/admin/inventory" },
    { permission: "inventory.overview", href: "/admin/inventory" },
    { permission: "reports.daily_report", href: "/admin/daily-report" },
    { permission: "reports.previous_sales", href: "/admin/previous-sales" },
    { permission: "reports.cash", href: "/admin/cash" },
    { permission: "reports.overview", href: "/admin/reports" },
    { permission: "wastage.overview", href: "/admin/wastage" },
    { permission: "vendors.overview", href: "/admin/vendors" },
    { permission: "expenses.business", href: "/admin/expenses" },
    { permission: "payroll.employees", href: "/admin/payroll" },
    { permission: "menu.categories", href: "/admin/menu" },
    { permission: "menu.board", href: "/admin/menu-board" },
    { permission: "inventory.recipe_book", href: "/admin/recipes" },
    { permission: "settings.general", href: "/admin/settings" },
    { permission: "staff", href: "/admin/staff" },
  ];
  for (const entry of order) {
    if (hasPermission(bearer, entry.permission)) return entry.href;
  }
  // Fallback: first hub page with any permitted tab
  for (const pagePath of Object.keys(ADMIN_TAB_PERMISSIONS)) {
    const tabs = permittedTabsForPage(bearer, pagePath);
    if (tabs?.length) return pagePath;
  }
  return "/admin/login";
}

/**
 * Map an admin page path to the permission required to view it.
 * Returns null for public login / paths that only need any authenticated user.
 */
export function permissionForAdminPagePath(
  pathname: string,
): AdminPermission | null {
  if (pathname === "/admin/login") return null;
  if (pathname === "/admin" || pathname === "/admin/") return "dashboard";

  const rules: { prefix: string; permission: AdminPermission }[] = [
    { prefix: "/admin/dashboard", permission: "dashboard" },
    { prefix: "/admin/reports", permission: "reports.overview" },
    { prefix: "/admin/daily-report", permission: "reports.daily_report" },
    { prefix: "/admin/previous-sales", permission: "reports.previous_sales" },
    { prefix: "/admin/cash", permission: "reports.cash" },
    { prefix: "/admin/online-orders", permission: "online_orders" },
    { prefix: "/admin/orders", permission: "orders" },
    { prefix: "/admin/inventory", permission: "inventory.overview" },
    { prefix: "/admin/stock-usage", permission: "inventory.stock_usage" },
    { prefix: "/admin/recipes", permission: "inventory.recipe_book" },
    { prefix: "/admin/wastage", permission: "wastage.overview" },
    { prefix: "/admin/vendors", permission: "vendors.overview" },
    { prefix: "/admin/expenses", permission: "expenses.business" },
    { prefix: "/admin/floor-plan", permission: "floor_plan" },
    { prefix: "/admin/pos", permission: "pos" },
    { prefix: "/admin/menu-board", permission: "menu.board" },
    { prefix: "/admin/menu", permission: "menu.categories" },
    { prefix: "/admin/home-layout", permission: "home_layout" },
    { prefix: "/admin/payroll", permission: "payroll.employees" },
    { prefix: "/admin/settings", permission: "settings.general" },
    { prefix: "/admin/staff", permission: "staff" },
    { prefix: "/admin/categories", permission: "menu.categories" },
    { prefix: "/admin/items", permission: "menu.items" },
    { prefix: "/admin/addons", permission: "menu.addons" },
    { prefix: "/admin/combos", permission: "menu.combos" },
  ];

  for (const rule of rules) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.permission;
    }
  }
  return null;
}

/** Whether bearer may open this admin page (submenu-only access counts for tab hubs). */
export function canAccessAdminPagePath(
  bearer: PermissionBearer | null | undefined,
  pathname: string,
): boolean {
  const required = permissionForAdminPagePath(pathname);
  if (!required) return true;
  if (hasPermission(bearer, required)) return true;

  // Tabbed hub pages: any in-page tab permission opens the hub.
  // Sibling standalone pages (daily-report, menu-board, recipes) need exact
  // permission (already handled by hasPermission above).
  const hubTabMap = ADMIN_TAB_PERMISSIONS[pathname.split("?")[0]!];
  if (hubTabMap) {
    return Object.values(hubTabMap).some((p) => hasPermission(bearer, p));
  }

  return false;
}

/** Longest-prefix-first rules mapping `/api/admin/*` to accepted keys. */
const ADMIN_API_PERMISSION_RULES: {
  prefix: string;
  permissions: AdminPermission[];
}[] = [
  { prefix: "/api/admin/staff", permissions: ["staff"] },
  {
    prefix: "/api/admin/inventory/wastage",
    permissions: moduleLeafPermissions("wastage"),
  },
  {
    prefix: "/api/admin/inventory/menu-wastage",
    permissions: moduleLeafPermissions("wastage"),
  },
  {
    prefix: "/api/admin/inventory",
    permissions: moduleLeafPermissions("inventory"),
  },
  { prefix: "/api/admin/orders/pos", permissions: ["pos"] },
  {
    // Previous day sales is the only screen reading this.
    prefix: "/api/admin/orders/historical",
    permissions: [
      "orders",
      "reports.previous_sales",
      "reports.overview",
      "reports.sales",
    ],
  },
  { prefix: "/api/admin/pos", permissions: ["pos"] },
  { prefix: "/api/admin/orders", permissions: ["orders", "online_orders"] },
  { prefix: "/api/admin/vendors", permissions: moduleLeafPermissions("vendors") },
  {
    prefix: "/api/admin/expenses",
    permissions: moduleLeafPermissions("expenses"),
  },
  { prefix: "/api/admin/payroll", permissions: moduleLeafPermissions("payroll") },
  { prefix: "/api/admin/floor-plan", permissions: ["floor_plan"] },
  { prefix: "/api/admin/menu/layout", permissions: ["home_layout"] },
  { prefix: "/api/admin/menu", permissions: moduleLeafPermissions("menu") },
  {
    prefix: "/api/admin/settings",
    permissions: moduleLeafPermissions("settings"),
  },
  { prefix: "/api/admin/dashboard", permissions: ["dashboard"] },
  { prefix: "/api/admin/reports", permissions: moduleLeafPermissions("reports") },
  { prefix: "/api/admin/cash", permissions: ["reports.cash"] },
];

/**
 * Map an `/api/admin/*` path to required permission(s).
 * `null` = auth only. Non-empty array = user needs any one of the listed keys.
 */
export function permissionsForAdminApiPath(
  pathname: string,
): AdminPermission[] | null {
  if (
    pathname === "/api/admin/session" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/logout"
  ) {
    return null;
  }

  for (const rule of ADMIN_API_PERMISSION_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.permissions;
    }
  }

  return ["settings.general"];
}

/** Sidebar / nav entries with required permission. */
export const ADMIN_NAV_PERMISSION: Record<string, AdminPermission> = {
  "/admin/dashboard": "dashboard",
  "/admin/reports": "reports.overview",
  "/admin/daily-report": "reports.daily_report",
  "/admin/previous-sales": "reports.previous_sales",
  "/admin/cash": "reports.cash",
  "/admin/online-orders": "online_orders",
  "/admin/orders": "orders",
  "/admin/inventory": "inventory.overview",
  "/admin/stock-usage": "inventory.stock_usage",
  "/admin/recipes": "inventory.recipe_book",
  "/admin/wastage": "wastage.overview",
  "/admin/vendors": "vendors.overview",
  "/admin/expenses": "expenses.business",
  "/admin/floor-plan": "floor_plan",
  "/admin/pos": "pos",
  "/admin/pos/mobile": "pos",
  "/admin/pos/mobile/history": "pos",
  "/admin/menu": "menu.categories",
  "/admin/menu-board": "menu.board",
  "/admin/home-layout": "home_layout",
  "/admin/payroll": "payroll.employees",
  "/admin/settings": "settings.general",
  "/admin/staff": "staff",
};

/** In-page tab id → permission for modules that use ?tab= navigation. */
export const ADMIN_TAB_PERMISSIONS: Record<string, Record<string, AdminPermission>> = {
  "/admin/menu": {
    categories: "menu.categories",
    items: "menu.items",
    combos: "menu.combos",
    addons: "menu.addons",
  },
  "/admin/inventory": {
    overview: "inventory.overview",
    items: "inventory.items",
    suppliers: "inventory.suppliers",
    purchase: "inventory.purchase",
    recipes: "inventory.recipes",
    sell: "inventory.sell",
    ops: "inventory.ops",
  },
  "/admin/reports": {
    overview: "reports.overview",
    sales: "reports.sales",
    items: "reports.items",
    expenses: "reports.expenses",
    personal: "reports.personal",
    wastage: "reports.wastage",
  },
  "/admin/settings": {
    general: "settings.general",
    timing: "settings.timing",
    delivery: "settings.delivery",
    bill: "settings.bill",
    payment: "settings.payment",
    desktop: "settings.desktop",
  },
  "/admin/payroll": {
    employees: "payroll.employees",
    attendance: "payroll.attendance",
    advances: "payroll.advances",
    payrun: "payroll.payrun",
  },
  "/admin/vendors": {
    overview: "vendors.overview",
    vendors: "vendors.vendors",
    sellable: "vendors.sellable",
    sales: "vendors.sales",
    payments: "vendors.payments",
  },
  "/admin/expenses": {
    business: "expenses.business",
    personal: "expenses.personal",
  },
  "/admin/wastage": {
    overview: "wastage.overview",
    reports: "wastage.reports",
  },
};

export function permittedTabsForPage(
  bearer: PermissionBearer | null | undefined,
  pagePath: string,
): string[] | null {
  const map = ADMIN_TAB_PERMISSIONS[pagePath];
  if (!map) return null;
  return Object.entries(map)
    .filter(([, perm]) => hasPermission(bearer, perm))
    .map(([tab]) => tab);
}

export function firstPermittedTab(
  bearer: PermissionBearer | null | undefined,
  pagePath: string,
  fallback: string,
): string {
  const tabs = permittedTabsForPage(bearer, pagePath);
  if (!tabs?.length) return fallback;
  return tabs.includes(fallback) ? fallback : tabs[0]!;
}

/** Short summary for staff list, e.g. "Reports (3), Orders, POS". */
export function summarizePermissions(permissions: AdminPermission[]): string {
  if (permissions.length === 0) return "No access";

  const expanded = expandPermissionsForEditor(permissions);
  const byModule = new Map<string, number>();

  for (const p of expanded) {
    const mod = permissionModule(p);
    byModule.set(mod, (byModule.get(mod) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const root of ADMIN_PERMISSION_TREE) {
    const mod = root.key;
    const count = byModule.get(mod);
    if (!count) continue;
    const totalLeaves = leafPermissionsUnder(root).length;
    const label = root.label;
    if (count >= totalLeaves) {
      parts.push(label);
    } else {
      parts.push(`${label} (${count})`);
    }
  }

  return parts.length ? parts.join(", ") : "No access";
}
