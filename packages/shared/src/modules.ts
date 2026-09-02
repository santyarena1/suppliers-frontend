/**
 * Módulos reales de la plataforma (mismos ítems que el Navbar). Se usan para
 * los permisos por usuario que puede configurar el superadmin — ausencia de
 * excepción en UserModuleAccess = permitido según el rol.
 */
export const MODULE_KEYS = [
  "search",
  "cart",
  "credentials",
  "providers",
  "brands",
  "news",
  "diagnostics",
  "admin",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** Módulos que un ROLE_USER/ROLE_BRAND tiene habilitados por defecto (sin excepciones). */
export const DEFAULT_MODULES_BY_ROLE: Record<string, ModuleKey[]> = {
  ROLE_USER: ["search", "cart", "credentials", "providers", "brands", "news", "diagnostics"],
  ROLE_BRAND: ["search", "cart", "brands", "news", "diagnostics"],
  ROLE_ADMIN: [...MODULE_KEYS],
};
