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

export function getUser(): { username: string; role: string; id: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveSession(token: string, user: { username: string; role: string; id: string }) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  writeCookie(COOKIE, "1", ONE_DAY);
}

export function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  deleteCookie(COOKIE);
}

export function isAdmin(): boolean {
  return getUser()?.role === "ROLE_ADMIN";
}
