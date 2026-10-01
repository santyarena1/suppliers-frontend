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
 * Verificación de Cloudflare en las pantallas de acceso. En modo "solo si
 * hace falta": casi siempre no se ve nada; aparece únicamente cuando
 * Cloudflare quiere confirmar que hay una persona.
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
          appearance: "interaction-only",
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
