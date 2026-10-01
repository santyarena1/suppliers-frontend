"use client";

import { useEffect, useRef } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function googleSignInEnabled(): boolean {
  return CLIENT_ID.length > 0;
}

type Props = {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Botón de Google Identity Services. Solo se pinta si hay client id público.
 * El token lo verifica el API: acá no confiamos en lo que muestre Google.
 */
export default function GoogleSignInButton({ onCredential, disabled, className }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    function paint() {
      if (cancelled || !window.google || !slot.current) return;
      slot.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (res) => {
          if (res.credential) cb.current(res.credential);
        },
      });
      const width = Math.max(240, Math.min(slot.current.offsetWidth || 320, 400));
      window.google.accounts.id.renderButton(slot.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width,
      });
    }

    if (window.google) {
      paint();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.getElementById("google-gsi") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", paint);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", paint);
      };
    }

    const script = document.createElement("script");
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = paint;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div
      className={className}
      style={{ pointerEvents: disabled ? "none" : undefined, opacity: disabled ? 0.55 : 1 }}
    >
      <div ref={slot} />
    </div>
  );
}
