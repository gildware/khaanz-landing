/** Module permission keys for admin / staff login. */
export const ADMIN_PERMISSIONS = [
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

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  dashboard: "Dashboard",
  reports: "Reports",
  online_orders: "Online orders",
  orders: "Orders",
  inventory: "Inventory",
  wastage: "Wastage",
  vendors: "Vendors",
  expenses: "Expenses",
  floor_plan: "Table layout",
  pos: "POS",
  menu: "Menu catalogue",
  home_layout: "Home layout",
  payroll: "Payroll",
  settings: "Settings",
  staff: "Staff & logins",
};

/** Full access for existing admins and new full-access accounts. */
export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [...ADMIN_PERMISSIONS];

export function isAdminPermission(value: unknown): value is AdminPermission {
  return (
    typeof value === "string" &&
    (ADMIN_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function parsePermissionsJson(raw: unknown): AdminPermission[] {
  if (!Array.isArray(raw)) return [];
  const out: AdminPermission[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (isAdminPermission(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export function normalizePermissionsInput(raw: unknown): AdminPermission[] {
  return parsePermissionsJson(raw);
}

export type PermissionBearer = {
  role: string;
  permissions: AdminPermission[];
};

/** SUPER_ADMIN always has every module. Others use the explicit list.
 * Legacy ADMIN JWTs without a permissions claim are treated as full access
 * until `/api/admin/session` refreshes the cookie.
 */
export function hasPermission(
  bearer: PermissionBearer | null | undefined,
  permission: AdminPermission,
): boolean {
  if (!bearer) return false;
  if (bearer.role === "SUPER_ADMIN") return true;
  if (bearer.role === "ADMIN" && bearer.permissions.length === 0) return true;
  return bearer.permissions.includes(permission);
}

export function hasAnyPermission(
  bearer: PermissionBearer | null | undefined,
  permissions: AdminPermission[],
): boolean {
  return permissions.some((p) => hasPermission(bearer, p));
}

/** First panel home the user can open after login. */
export function defaultAdminHomePath(
  bearer: PermissionBearer,
): string {
  const order: { permission: AdminPermission; href: string }[] = [
    { permission: "dashboard", href: "/admin/dashboard" },
    { permission: "online_orders", href: "/admin/online-orders" },
    { permission: "orders", href: "/admin/orders" },
    { permission: "pos", href: "/admin/pos" },
    { permission: "inventory", href: "/admin/inventory" },
    { permission: "reports", href: "/admin/reports" },
    { permission: "wastage", href: "/admin/wastage" },
    { permission: "vendors", href: "/admin/vendors" },
    { permission: "expenses", href: "/admin/expenses" },
    { permission: "payroll", href: "/admin/payroll" },
    { permission: "menu", href: "/admin/menu" },
    { permission: "settings", href: "/admin/settings" },
    { permission: "staff", href: "/admin/staff" },
  ];
  for (const entry of order) {
    if (hasPermission(bearer, entry.permission)) return entry.href;
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
    { prefix: "/admin/reports", permission: "reports" },
    { prefix: "/admin/online-orders", permission: "online_orders" },
    { prefix: "/admin/orders", permission: "orders" },
    { prefix: "/admin/inventory", permission: "inventory" },
    { prefix: "/admin/wastage", permission: "wastage" },
    { prefix: "/admin/vendors", permission: "vendors" },
    { prefix: "/admin/expenses", permission: "expenses" },
    { prefix: "/admin/floor-plan", permission: "floor_plan" },
    { prefix: "/admin/pos", permission: "pos" },
    { prefix: "/admin/menu", permission: "menu" },
    { prefix: "/admin/home-layout", permission: "home_layout" },
    { prefix: "/admin/payroll", permission: "payroll" },
    { prefix: "/admin/settings", permission: "settings" },
    { prefix: "/admin/staff", permission: "staff" },
    { prefix: "/admin/categories", permission: "menu" },
    { prefix: "/admin/items", permission: "menu" },
    { prefix: "/admin/addons", permission: "menu" },
    { prefix: "/admin/combos", permission: "menu" },
  ];

  for (const rule of rules) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.permission;
    }
  }
  return null;
}

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

  const rules: { prefix: string; permissions: AdminPermission[] }[] = [
    { prefix: "/api/admin/staff", permissions: ["staff"] },
    { prefix: "/api/admin/inventory/wastage", permissions: ["wastage"] },
    { prefix: "/api/admin/inventory/menu-wastage", permissions: ["wastage"] },
    { prefix: "/api/admin/inventory", permissions: ["inventory"] },
    { prefix: "/api/admin/orders/pos", permissions: ["pos"] },
    { prefix: "/api/admin/pos", permissions: ["pos"] },
    {
      prefix: "/api/admin/orders",
      permissions: ["orders", "online_orders"],
    },
    { prefix: "/api/admin/vendors", permissions: ["vendors"] },
    { prefix: "/api/admin/expenses", permissions: ["expenses"] },
    { prefix: "/api/admin/payroll", permissions: ["payroll"] },
    { prefix: "/api/admin/floor-plan", permissions: ["floor_plan"] },
    { prefix: "/api/admin/menu/layout", permissions: ["home_layout"] },
    { prefix: "/api/admin/menu", permissions: ["menu"] },
    { prefix: "/api/admin/settings", permissions: ["settings"] },
    { prefix: "/api/admin/reset-data", permissions: ["settings"] },
    { prefix: "/api/admin/dashboard", permissions: ["dashboard"] },
    { prefix: "/api/admin/reports", permissions: ["reports"] },
  ];

  for (const rule of rules) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.permissions;
    }
  }

  return ["settings"];
}

/** Sidebar / nav entries with required permission. */
export const ADMIN_NAV_PERMISSION: Record<string, AdminPermission> = {
  "/admin/dashboard": "dashboard",
  "/admin/reports": "reports",
  "/admin/online-orders": "online_orders",
  "/admin/orders": "orders",
  "/admin/inventory": "inventory",
  "/admin/wastage": "wastage",
  "/admin/vendors": "vendors",
  "/admin/expenses": "expenses",
  "/admin/floor-plan": "floor_plan",
  "/admin/pos": "pos",
  "/admin/pos/mobile": "pos",
  "/admin/pos/mobile/history": "pos",
  "/admin/menu": "menu",
  "/admin/home-layout": "home_layout",
  "/admin/payroll": "payroll",
  "/admin/settings": "settings",
  "/admin/staff": "staff",
};
