import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/auth/session";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/register"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_AUTH_PATHS.has(pathname)) {
    return true;
  }
  if (
    pathname === "/api/health" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/")
  ) {
    return true;
  }
  return false;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Route Handlers enforce full DB-backed session verification and return JSON 401/403
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!isPublicPath(pathname) && !hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    const nextValue = `${pathname}${search}`;
    if (nextValue.startsWith("/") && !nextValue.startsWith("//") && nextValue !== "/") {
      loginUrl.searchParams.set("next", nextValue);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
