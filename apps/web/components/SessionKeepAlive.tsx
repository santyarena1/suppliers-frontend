"use client";

import { useEffect } from "react";
import { authApi } from "@/lib/api";
import { getToken, getUser, isTokenExpired, persistAuthCookie, saveSession, sessionFromToken } from "@/lib/auth";

const INTERVAL_MS = 4 * 60 * 1000;

async function renewIfNeeded() {
  const token = getToken();
  if (!token || isTokenExpired(token, 0)) return;
  persistAuthCookie(token);
  try {
    const res = await authApi.refresh();
    const next = res.data?.token;
    if (!next) return;
    const prev = getUser();
    saveSession(next, sessionFromToken(next, prev?.username ?? ""));
  } catch {
    /* si el JWT ya no sirve, el interceptor manda a login */
  }
}

/**
 * Mientras la pestaña está abierta, renueva el JWT y reescribe la cookie del
 * middleware. Sin esto, a los 15 min el primer toque al carrito (varias APIs
 * de checkout) parece un cierre de sesión.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    persistAuthCookie();
    const id = window.setInterval(() => void renewIfNeeded(), INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void renewIfNeeded();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
