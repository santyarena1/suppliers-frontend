"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PLAN_UPSELL, type PlanCapabilityKey } from "@/lib/plans";

/**
 * Aviso de upgrade en contexto: aparece donde la función haría falta, nunca
 * como pop-up. `message` pisa el texto por defecto de la capacidad.
 */
export default function UpsellNotice({
  capability,
  message,
  compact = false,
  className = "",
}: {
  capability: PlanCapabilityKey;
  message?: string;
  compact?: boolean;
  className?: string;
}) {
  const custom = capability === "externalIntegrations" || capability === "customModules" || capability === "customBranding";
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/5 ${
        compact ? "px-3 py-2" : "px-4 py-3"
      } ${className}`}
    >
      <Sparkles className="h-4 w-4 flex-shrink-0 text-brand-300" />
      <p className={`flex-1 min-w-[180px] text-surface-200 ${compact ? "text-xs" : "text-sm"}`}>{message ?? PLAN_UPSELL[capability]}</p>
      <Link href="/suscripcion" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
        {custom ? "Conocer NODO Custom" : "Conocer NODO Pro"}
      </Link>
    </div>
  );
}
