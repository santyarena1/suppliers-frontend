"use client";

import api from "@/lib/api";
import { getToken } from "@/lib/auth";
import { APP_VERSION } from "@/lib/changelog";

const sent = new Set<string>();

/** Avisa al servidor que una pantalla se rompió (queda en el log de la API). Una vez por error. */
export function reportClientError(error: Error & { digest?: string }) {
  if (typeof window === "undefined" || !getToken()) return;
  const key = `${error.message}|${window.location.pathname}`;
  if (sent.has(key)) return;
  sent.add(key);
  void api
    .post("/monitoring/client-errors", {
      path: window.location.pathname + window.location.search,
      version: APP_VERSION,
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
    .catch(() => {
      /* si tampoco hay red, no hay a quién avisar */
    });
}
