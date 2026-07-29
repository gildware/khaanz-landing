import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminToken, sessionHasPermission } from "@/lib/admin-auth";
import {
  canAccessAdminPagePath,
  defaultAdminHomePath,
  permissionsForAdminApiPath,
  hasAnyPermission,
  type AdminPermission,
} from "@/lib/admin-permissions";
import { isMobileUserAgent } from "@/lib/is-mobile";

/**
 * Restaurant config (settings / menu / floor plan) is read by almost every
 * screen — POS, Orders, Previous day sales — for payment methods, tables and
 * dish names. Reading it needs only a signed-in admin; writing still needs the
 * owning permission.
 */
function apiPermissionsForRequest(
  pathname: string,
  method: string,
): AdminPermission[] | null {
  const base = permissionsForAdminApiPath(pathname);
  if (!base) return null;

  const isGet = method === "GET" || method === "HEAD";
  if (
    isGet &&
    (pathname === "/api/admin/settings" ||
      pathname.startsWith("/api/admin/floor-plan") ||
      pathname === "/api/admin/menu")
  ) {
    return null;
  }

  return base;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Admin API permission gate (JWT claims; refreshed via /api/admin/session) ---
  if (pathname.startsWith("/api/admin")) {
    if (
      pathname === "/api/admin/login" ||
      pathname === "/api/admin/logout" ||
      pathname === "/api/admin/session"
    ) {
      return NextResponse.next();
    }

    const token = request.cookies.get("admin_token")?.value;
    const session = await verifyAdminToken(token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const needed = apiPermissionsForRequest(pathname, request.method);
    if (
      needed &&
      !hasAnyPermission(
        { role: session.role, permissions: session.permissions },
        needed,
      )
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.next();
  }

  // --- Admin pages ---
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;
  const session = await verifyAdminToken(token);
  const preferMobile = isMobileUserAgent(request.headers.get("user-agent"));
  const bearer = session
    ? { role: session.role, permissions: session.permissions }
    : null;
  const onMobilePos = pathname.startsWith("/admin/pos/mobile");

  if (pathname === "/admin" || pathname === "/admin/") {
    if (!session || !bearer) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("from", "/admin");
      return NextResponse.redirect(login);
    }
    const home = defaultAdminHomePath(bearer, { preferMobile });
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (!session) {
    const login = new URL("/admin/login", request.url);
    // Mobile: after login always land on POS Mobile, not deep panel links.
    login.searchParams.set(
      "from",
      preferMobile ? "/admin/pos/mobile" : pathname,
    );
    return NextResponse.redirect(login);
  }

  // Mobile phones: every /admin link → POS Mobile (except login + mobile POS itself).
  if (
    preferMobile &&
    !onMobilePos &&
    sessionHasPermission(session, "pos")
  ) {
    return NextResponse.redirect(new URL("/admin/pos/mobile", request.url));
  }

  if (
    !canAccessAdminPagePath(
      { role: session.role, permissions: session.permissions },
      pathname,
    )
  ) {
    const home = defaultAdminHomePath(
      { role: session.role, permissions: session.permissions },
      { preferMobile },
    );
    if (home === pathname || home === "/admin/login") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
