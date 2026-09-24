import { NextResponse, NextRequest } from "next/server";

// Solo estas rebotan al inicio cuando ya hay sesión: entrar al login estando
// logueado no tiene sentido.
const AUTH_PATHS = new Set(["/login", "/register"]);
// Estas se ven siempre, con o sin sesión. Un usuario logueado tiene que poder
// abrir la landing o una propuesta sin que lo manden a la app.
const OPEN_PATHS = new Set(["/landing", "/preview", "/actualizacion"]);
const PUBLIC_PREFIXES = ["/_next", "/api", "/img-proxy", "/favicon", "/static", "/icon", "/logo-", "/apple-icon", "/m", "/n"];

function maintenanceEnabled(): boolean {
  const raw = (process.env.MAINTENANCE_MODE || process.env.NEXT_PUBLIC_MAINTENANCE_MODE || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isPrefetch(req: NextRequest): boolean {
  return (
    req.headers.get("x-middleware-prefetch") === "1" ||
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Mantenimiento planificado: toda la app muestra /actualizacion.
  // Activa con MAINTENANCE_MODE=1 en el entorno del frontend.
  if (maintenanceEnabled()) {
    if (pathname === "/actualizacion") return NextResponse.next();
    if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/actualizacion";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
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
