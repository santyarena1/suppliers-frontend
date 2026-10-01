"use client";

import { useEffect } from "react";
import { healthApi } from "@/lib/api";
import { getToken } from "@/lib/auth";

const RECENT_KEY = "nodo_client_error_fp";
const DEDUPE_MS = 60_000;
const MAX_TRACKED = 40;

type FingerprintStore = { at: number; fp: string }[];

function loadStore(): FingerprintStore {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FingerprintStore;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStore(store: FingerprintStore) {
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(store.slice(-MAX_TRACKED)));
  } catch {
    /* ignore quota */
  }
}

function shouldSend(fp: string): boolean {
  const now = Date.now();
  const store = loadStore().filter((x) => now - x.at < DEDUPE_MS);
  if (store.some((x) => x.fp === fp)) {
    saveStore(store);
    return false;
  }
  store.push({ at: now, fp });
  saveStore(store);
  return true;
}

function fingerprint(kind: string, message: string, source?: string) {
  return `${kind}|${message.slice(0, 160)}|${source || ""}`;
}

function report(payload: Parameters<typeof healthApi.reportClientError>[0]) {
  if (typeof window === "undefined") return;
  if (!getToken()) return;
  const fp = fingerprint(payload.kind, payload.message, payload.source);
  if (!shouldSend(fp)) return;
  void healthApi.reportClientError(payload).catch(() => {
    /* no re-reportar el fallo del reporter */
  });
}

/**
 * Captura errores de JS / promesas no manejadas en la app autenticada
 * y los manda al panel Salud del superadmin.
 */
export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      report({
        kind: "js",
        message: ev.message || "Error de script",
        stack: ev.error?.stack ? String(ev.error.stack) : undefined,
        source: ev.filename || undefined,
        line: typeof ev.lineno === "number" ? ev.lineno : undefined,
        column: typeof ev.colno === "number" ? ev.colno : undefined,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      const stack = reason instanceof Error ? reason.stack : undefined;
      report({
        kind: "unhandledrejection",
        message: String(message).slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : undefined,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
