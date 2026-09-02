import { NextResponse, NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/register"]);
const PUBLIC_PREFIXES = ["/_next", "/api", "/img-proxy", "/favicon", "/static", "/icon", "/logo-", "/apple-icon", "/m"];

function isPrefetch(req: NextRequest): boolean {
  return (
    req.headers.get("x-middleware-prefetch") === "1" ||
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return guardLogin(req);
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const auth = req.cookies.get("tgs_auth")?.value;
  if (!auth) {
    // Un prefetch sin cookie no puede cachear el redirect a /login: Next lo
    // guarda como destino de /cart (u otra ruta) y al tocarla parece que se
    // cerró la sesión.
    if (isPrefetch(req)) {
      return new NextResponse(null, { status: 204 });
    }
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
