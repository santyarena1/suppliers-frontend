"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { PlanCapabilityKey } from "@/lib/plans";
import { capabilityAllowed, useSubscription } from "@/lib/subscription";
import UpsellNotice from "./UpsellNotice";

/**
 * Muestra `children` si el plan del comercio incluye la capacidad. Si falta
 * plan, un aviso de upgrade en contexto; si la suscripción está suspendida, el
 * camino para regularizarla. El backend corta igual: esto solo evita pantallas
 * que terminarían en error.
 */
export default function PlanGate({
  capability,
  message,
  children,
  className = "",
}: {
  capability: PlanCapabilityKey;
  message?: string;
  children: ReactNode;
  className?: string;
}) {
  const { subscription, loading } = useSubscription();
  if (loading) return null;
  if (capabilityAllowed(subscription, capability)) return <>{children}</>;
  if (subscription && subscription.access !== "FULL" && subscription.capabilities[capability]) {
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 ${className}`}>
        <Lock className="h-4 w-4 flex-shrink-0 text-red-300" />
        <p className="flex-1 min-w-[180px] text-sm text-surface-200">
          Tu suscripción está suspendida. Regularizá el pago para volver a usar esta función.
        </p>
        <Link href="/suscripcion" className="text-xs font-semibold text-red-300 hover:text-red-200">
          Ver suscripción
        </Link>
      </div>
    );
  }
  return <UpsellNotice capability={capability} message={message} className={className} />;
}
