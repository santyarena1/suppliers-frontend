import { NextResponse, NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/register"]);
const PUBLIC_PREFIXES = ["/_next", "/api", "/img-proxy", "/favicon", "/static", "/icon", "/logo-", "/apple-icon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return guardLogin(req);
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const auth = req.cookies.get("tgs_auth")?.value;
  if (!auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function guardLogin(req: NextRequest) {
  const auth = req.cookies.get("tgs_auth")?.value;
  if (auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|img-proxy|favicon|static).*)"],
};
