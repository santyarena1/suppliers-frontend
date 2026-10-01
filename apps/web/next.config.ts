import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para todo el sitio.
 *
 * - frame-ancestors / X-Frame-Options: nadie puede meter NODO en un iframe para
 *   que el usuario haga clics sin saberlo.
 * - HSTS: el navegador no vuelve a entrar por http.
 * - object-src/base-uri/form-action: cortan inyecciones que cambian a dónde
 *   apuntan los links o los formularios.
 * La CSP de scripts completa (con nonce) queda para cuando se pueda probar
 * contra Google Sign-In y los scripts de Next.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }, { protocol: "http", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
