import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminToken } from "@/lib/admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;
  const session = await verifyAdminToken(token);

  if (pathname === "/admin") {
    if (!session) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("from", "/admin");
      return NextResponse.redirect(login);
    }
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  if (!session) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
