import { NextResponse, type NextRequest } from "next/server";

// Cheap edge gate: bounce signed-out visitors before rendering protected pages.
// Real role checks happen server-side in each layout (lib/auth.ts#requireRole).
const PROTECTED = ["/owner", "/admin", "/me", "/reserve", "/holds"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !req.cookies.has("ekifo_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*", "/me/:path*", "/reserve/:path*", "/holds/:path*"],
};
