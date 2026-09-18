"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Compass, X } from "lucide-react";
import { onboardingApi, type OnboardingStatus } from "@/lib/api";
import { getUser } from "@/lib/auth";

/**
 * Si el usuario no tiene organización o no terminó el recorrido de comercio,
 * lo manda a `/onboarding`. Superadmin y distros/marcas no pasan por acá.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  const check = useCallback(async () => {
    const user = getUser();
    if (!user || user.role === "ROLE_ADMIN") {
      setReady(true);
      return;
    }
    try {
      const res = await onboardingApi.status();
      setStatus(res.data);
      // Sin organización no hay app usable: hay que crear el comercio primero.
      if (!res.data.hasTenant && pathname !== "/onboarding") {
        router.replace("/onboarding");
        return;
      }
    } catch {
      // Si el endpoint falla no bloqueamos la app; el CurrentTenant del API
      // seguirá rechazando acciones sin organización.
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

  return (
    <>
      {children}
      {status && status.hasTenant && status.needsOnboarding && pathname !== "/onboarding" && (
        <OnboardingCoachBanner status={status} onDismiss={() => setStatus({ ...status, needsOnboarding: false })} />
      )}
    </>
  );
}

function OnboardingCoachBanner({
  status,
  onDismiss,
}: {
  status: OnboardingStatus;
  onDismiss: () => void;
}) {
  const step = status.steps.find((s) => s.id !== "org") ?? status.steps[0];
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-brand-500/30 bg-surface-900/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:right-6">
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-surface-50">Recorrido de NODO</p>
          <p className="mt-0.5 text-xs text-surface-400 line-clamp-2">
            {step?.body ?? "Seguí explorando con los datos de demostración."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center rounded-md bg-brand-500/20 px-2.5 py-1 text-xs font-semibold text-brand-200 hover:bg-brand-500/30"
            >
              Continuar guía
            </Link>
            {step?.href && (
              <Link
                href={step.href}
                className="inline-flex items-center rounded-md border border-surface-700 px-2.5 py-1 text-xs text-surface-300 hover:border-surface-500"
              >
                Ir a {step.title}
              </Link>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="Ocultar"
          onClick={onDismiss}
          className="rounded p-1 text-surface-500 hover:bg-surface-800 hover:text-surface-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
