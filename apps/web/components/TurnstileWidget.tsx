"use client";

import { useEffect, useRef } from "react";
import {
  TURNSTILE_SITE_KEY,
  clearHumanToken,
  provideHumanToken,
  registerTurnstileReset,
  turnstileEnabled,
} from "@/lib/turnstile";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? Object.assign(document.createElement("script"), { id: SCRIPT_ID, src: SCRIPT_SRC, async: true, defer: true });
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("turnstile")));
    if (!existing) document.head.appendChild(script);
  });
}

/**
 * Verificación de Cloudflare en las pantallas de acceso. Siempre visible: casi
 * siempre se tilda sola en un segundo; si Cloudflare quiere confirmar, se ve la casilla.
 */
export default function TurnstileWidget({ className = "" }: { className?: string }) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!turnstileEnabled()) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !slot.current || !window.turnstile) return;
        widgetId = window.turnstile.render(slot.current, {
          sitekey: TURNSTILE_SITE_KEY,
          // Siempre visible: en modo invisible, si Cloudflare pedía confirmar no se
          // veía nada y el ingreso salía sin token ("no verificó").
          appearance: "always",
          size: "flexible",
          "refresh-expired": "auto",
          retry: "auto",
          theme: "dark",
          language: "es",
          callback: (value: string) => provideHumanToken(value),
          "expired-callback": () => clearHumanToken(),
          "error-callback": () => clearHumanToken(),
        });
        registerTurnstileReset(() => {
          if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
        });
      })
      .catch(() => {
        /* sin el script el API decide; no bloquea la pantalla */
      });
    return () => {
      cancelled = true;
      registerTurnstileReset(null);
      clearHumanToken();
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  if (!turnstileEnabled()) return null;
  return <div ref={slot} className={className} />;
}
