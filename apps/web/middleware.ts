import { NextResponse, NextRequest } from "next/server";

// Solo estas rebotan al inicio cuando ya hay sesión: entrar al login estando
// logueado no tiene sentido.
const AUTH_PATHS = new Set(["/login", "/register", "/verify-email", "/forgot-password"]);
// Estas se ven siempre, con o sin sesión. Un usuario logueado tiene que poder
// abrir la landing o una propuesta sin que lo manden a la app.
const OPEN_PATHS = new Set(["/landing", "/preview"]);
/**
 * Direcciones públicas de la landing; por dentro se sirven desde /landing.
 * /marcas también es una sección de la app: con sesión gana la app.
 */
const LANDING_PAGES: Record<string, string> = {
  "/distribuidores": "/landing/distribuidores",
  "/marcas": "/landing/marcas",
};
const APP_PATHS_WITH_SESSION = new Set(["/marcas"]);
const LANDING_REDIRECTS: Record<string, string> = {
  "/landing/distribuidores": "/distribuidores",
  "/landing/marcas": "/marcas",
};
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

  const auth = req.cookies.get("tgs_auth")?.value;

  // La landing vive en la raíz del dominio. /landing queda para quien tiene
  // sesión (en la raíz ve la app) y para links viejos, que se redirigen.
  if (LANDING_PAGES[pathname] && !(auth && APP_PATHS_WITH_SESSION.has(pathname))) {
    return rewriteTo(req, LANDING_PAGES[pathname]);
  }
  if (LANDING_REDIRECTS[pathname]) return redirectTo(req, LANDING_REDIRECTS[pathname]);
  if (pathname === "/landing" && !auth) return redirectTo(req, "/");
  if (pathname === "/" && !auth) return rewriteTo(req, "/landing");

  // Lo que cuelga de la landing (fotos de las demos) es tan público como la landing.
  if (OPEN_PATHS.has(pathname) || pathname.startsWith("/landing/")) return NextResponse.next();
  if (AUTH_PATHS.has(pathname)) return guardLogin(req);
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

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

function rewriteTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

function redirectTo(req: NextRequest, pathname: string) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url, 308);
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
