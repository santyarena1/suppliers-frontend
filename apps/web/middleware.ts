import { NextResponse, NextRequest } from "next/server";

// Solo estas rebotan al inicio cuando ya hay sesión: entrar al login estando
// logueado no tiene sentido.
const AUTH_PATHS = new Set(["/login", "/register", "/verify-email"]);
// Estas se ven siempre, con o sin sesión. Un usuario logueado tiene que poder
// abrir la landing o una propuesta sin que lo manden a la app.
const OPEN_PATHS = new Set(["/landing", "/preview"]);
/** El dominio de NODO. Los anteriores redirigen acá con la misma ruta. */
const CANONICAL_HOST = "nodohub.app";
const LEGACY_HOSTS = new Set(["suppliers-frontend.vercel.app", "www.nodohub.app"]);
const PUBLIC_PREFIXES = ["/_next", "/api", "/img-proxy", "/favicon", "/static", "/icon", "/logo-", "/apple-icon", "/m", "/n"];

function isPrefetch(req: NextRequest): boolean {
  return (
    req.headers.get("x-middleware-prefetch") === "1" ||
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api queda afuera del matcher: los proxies que llama el backend siguen
  // respondiendo en el dominio viejo mientras se actualizan.
  const host = (req.headers.get("host") || "").toLowerCase();
  if (LEGACY_HOSTS.has(host)) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // Lo que cuelga de la landing (páginas de marcas y distribuidores, fotos de
  // las demos) es tan público como la landing.
  if (OPEN_PATHS.has(pathname) || pathname.startsWith("/landing/")) return NextResponse.next();
  if (AUTH_PATHS.has(pathname)) return guardLogin(req);
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
    // Sin sesión, la raíz es la landing pública; el resto sigue yendo al login.
    if (pathname === "/") {
      url.pathname = "/landing";
      return NextResponse.redirect(url);
    }
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
