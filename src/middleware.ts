import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.ADMIN_SESSION_SECRET ?? "khaanz-dev-admin-secret-change-me",
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;

  /** `/admin` has no page — redirect here so dev never hits a missing app-build-manifest */
  if (pathname === "/admin") {
    if (!token) {
      const login = new URL("/admin/login", request.url);
      login.searchParams.set("from", "/admin");
      return NextResponse.redirect(login);
    }
    try {
      await jwtVerify(token, secret);
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (!token) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
