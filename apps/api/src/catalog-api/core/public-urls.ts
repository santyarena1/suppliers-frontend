import { isServerRuntime } from "./runtime";

/** URL pública de la API (la que usan los integradores). */
export function publicApiUrl(): string {
  const fromEnv = (process.env.PUBLIC_API_URL || process.env.CATALOG_API_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return isServerRuntime()
    ? "https://api.nodohub.app"
    : `http://localhost:${process.env.PORT || 8080}`;
}

/** Guía de la API en la web. */
export function docsUrl(): string {
  const web = (process.env.PUBLIC_WEB_URL || process.env.WEB_URL || "https://nodohub.app").trim().replace(/\/+$/, "");
  return `${web}/developers`;
}
