"use client";

const COOKIE = "tgs_auth";
const ONE_DAY = 60 * 60 * 24;

function writeCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export type UserRole = "ROLE_USER" | "ROLE_ADMIN" | "ROLE_BRAND";
export type TenantType = "RETAILER" | "DISTRIBUTOR" | "BRAND";
export type TenantRole = "OWNER" | "ADMIN" | "BUYER" | "SELLER" | "PRODUCT_MANAGER" | "MARKETING" | "COMMERCIAL" | "VIEWER";

export interface SessionUser {
  username: string;
  role: UserRole;
  id: string;
  email?: string;
  brandId?: string;
  /** Organización de la persona. El superadmin de prueba está en Administración. */
  tenantId?: string;
  tenantName?: string;
  tenantType?: TenantType;
  tenantRole?: TenantRole;
}

/**
 * Arma la sesión leyendo el token, que es quien tiene la verdad sobre la
 * organización y el rol. Lo usan tanto el login como la suplantación, para que las
 * dos entradas a la plataforma produzcan exactamente la misma sesión.
 */
export function sessionFromToken(token: string, fallbackUsername = ""): SessionUser {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(atob(token.split(".")[1]));
  } catch {
    // Un token ilegible igual deja una sesión mínima; la API va a rechazarlo y el
    // interceptor de 401 se encarga de mandar a login.
  }
  const str = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : undefined);

  return {
    username: str("sub") ?? fallbackUsername,
    role: (str("role") as UserRole) ?? "ROLE_USER",
    id: str("userId") ?? "",
    email: str("email"),
    brandId: str("brandId"),
    tenantId: str("tenantId"),
    tenantName: str("tenantName"),
    tenantType: str("tenantType") as TenantType | undefined,
    tenantRole: str("tenantRole") as TenantRole | undefined,
  };
}

/** La organización de quien está usando la plataforma, si pertenece a alguna. */
export function getTenant(): { id: string; name: string; type: TenantType; role: TenantRole } | null {
  const user = getUser();
  if (!user?.tenantId || !user.tenantName || !user.tenantType || !user.tenantRole) return null;
  return { id: user.tenantId, name: user.tenantName, type: user.tenantType, role: user.tenantRole };
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export const SESSION_EVENT = "nodo-session";

function emitSession() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  writeCookie(COOKIE, "1", ONE_DAY);
  emitSession();
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  deleteCookie(COOKIE);
  emitSession();
}

// ---------- Suplantación ----------
//
// Mientras el superadmin navega como otro usuario, su propia sesión queda
// guardada aparte para poder devolvérsela sin obligarlo a entrar de nuevo.

const ADMIN_TOKEN_KEY = "impersonation_admin_token";
const ADMIN_USER_KEY = "impersonation_admin_user";

export function startImpersonation(token: string, user: SessionUser) {
  const currentToken = localStorage.getItem("token");
  const currentUser = localStorage.getItem("user");
  if (currentToken && currentUser) {
    localStorage.setItem(ADMIN_TOKEN_KEY, currentToken);
    localStorage.setItem(ADMIN_USER_KEY, currentUser);
  }
  saveSession(token, user);
}

/** El administrador detrás de la sesión actual, o `null` si no hay suplantación. */
export function getImpersonator(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ADMIN_USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Devuelve la sesión original. `false` si ya no queda nada que restaurar. */
export function stopImpersonation(): boolean {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const user = localStorage.getItem(ADMIN_USER_KEY);
  if (!token || !user) return false;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  localStorage.setItem("token", token);
  localStorage.setItem("user", user);
  writeCookie(COOKIE, "1", ONE_DAY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EVENT));
  return true;
}

export function isAdmin(): boolean {
  return getUser()?.role === "ROLE_ADMIN";
}

export function isBrand(): boolean {
  return getUser()?.role === "ROLE_BRAND";
}

export function isUser(): boolean {
  return getUser()?.role === "ROLE_USER";
}

export function getBrandId(): string | null {
  return getUser()?.brandId ?? null;
}
