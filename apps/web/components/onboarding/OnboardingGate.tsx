"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";
import OnboardingChecklist from "./OnboardingChecklist";
import OnboardingCoach from "./OnboardingCoach";

/** Sin organización todavía: primero se crea el comercio en /onboarding. */
function RequireOrganization({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useOnboarding();
  const missingOrg = Boolean(status && !status.hasTenant && status.canBootstrap);

  useEffect(() => {
    if (missingOrg && pathname !== "/onboarding") router.replace("/onboarding");
  }, [missingOrg, pathname, router]);

  return <>{children}</>;
}

/**
 * Monta el recorrido guiado sobre la app: la guía (si está corriendo) o la
 * lista de primeros pasos (si está pausada). Nunca tapa la app mientras carga.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <RequireOrganization>{children}</RequireOrganization>
      <OnboardingCoach />
      <OnboardingChecklist />
    </OnboardingProvider>
  );
}
