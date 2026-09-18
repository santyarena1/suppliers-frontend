"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, X } from "lucide-react";
import { onboardingApi, type OnboardingStatus } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { loadTour } from "@/lib/onboarding-tour";
import OnboardingSpotlight from "./OnboardingSpotlight";

/**
 * Sin organización → /onboarding.
 * Si el tour interactivo está activo, monta el spotlight.
 * Superadmin en preview también necesita onboarding.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  const check = useCallback(async () => {
    const user = getUser();
    // Admin fuera de preview no se fuerza al onboarding.
    try {
      const res = await onboardingApi.status();
      setStatus(res.data);
      if (!res.data.hasTenant && pathname !== "/onboarding") {
        router.replace("/onboarding");
        return;
      }
      if (res.data.preview && res.data.needsOnboarding && pathname !== "/onboarding" && !loadTour()?.active) {
        // Preview a medias sin tour activo: que vuelva al hub.
        if (!res.data.hasTenant) {
          router.replace("/onboarding");
          return;
        }
      }
    } catch {
      if (user?.role === "ROLE_ADMIN") {
        setReady(true);
        return;
      }
    }
    setReady(true);
  }, [pathname, router]);

  useEffect(() => {
    void check();
  }, [check]);

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  const tourActive = Boolean(loadTour()?.active);

  return (
    <>
      {children}
      <OnboardingSpotlight />
      {status && status.hasTenant && status.needsOnboarding && !tourActive && pathname !== "/onboarding" && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-brand-500/30 bg-surface-900/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:right-6">
          <div className="flex items-start gap-3">
            <Compass className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-surface-50">Recorrido de NODO</p>
              <p className="mt-0.5 text-xs text-surface-400 line-clamp-2">
                Seguí la guía con los clics resaltados, o volvé al hub del recorrido.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center rounded-md bg-brand-500/20 px-2.5 py-1 text-xs font-semibold text-brand-200 hover:bg-brand-500/30"
                >
                  Continuar guía
                </Link>
              </div>
            </div>
            <button
              type="button"
              aria-label="Ocultar"
              onClick={() => setStatus(status ? { ...status, needsOnboarding: false } : null)}
              className="rounded p-1 text-surface-500 hover:bg-surface-800 hover:text-surface-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
