import { NextRequest, NextResponse } from "next/server";

// NextAuth v5 session cookie names (HTTP vs HTTPS)
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

const STATIC_FILE_EXT_RE = /\.(?:png|jpg|jpeg|svg|webp|ico|json|webmanifest|txt|xml|js|css|map)$/i;

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let static assets, API routes, and NextAuth routes pass through
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    STATIC_FILE_EXT_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSession =
    req.cookies.has(SESSION_COOKIE) || req.cookies.has(SECURE_SESSION_COOKIE);

  const isLoginPage = pathname === "/login";

  if (!hasSession && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
