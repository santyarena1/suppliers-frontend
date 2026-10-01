"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Lock } from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import WhatsAppButton from "@/components/WhatsAppButton";

/**
 * Aviso de vencimiento para el comercio. Vencida o en gracia sigue operando; con
 * la cuenta suspendida el aviso es rojo y lleva a regularizar. No se muestra en
 * la misma pantalla de Plan y facturación.
 */
export default function SubscriptionBanner() {
  const pathname = usePathname();
  const { subscription } = useSubscription();
  if (!subscription || pathname.startsWith("/suscripcion")) return null;

  const { status } = subscription;
  if (status !== "PAST_DUE" && status !== "GRACE_PERIOD" && status !== "SUSPENDED" && !(status === "CANCELLED" && subscription.access === "RESTRICTED")) {
    return null;
  }
  const restricted = subscription.access === "RESTRICTED";

  return (
    <div
      role="status"
      className={`flex-shrink-0 border-b px-4 sm:px-6 py-2.5 ${
        restricted ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        {restricted ? <Lock className="w-4 h-4 text-red-300" /> : <AlertTriangle className="w-4 h-4 text-amber-300" />}
        <p className="text-sm text-white flex-1 min-w-[200px]">
          {restricted
            ? "Tu cuenta está suspendida. Tus datos siguen intactos: coordiná el pago con NODO para volver a operar."
            : "Tu suscripción venció. Coordiná el pago con NODO para mantenerla activa."}
        </p>
        <WhatsAppButton forPayment size="sm" label="Coordinar pago" />
        <Link
          href="/suscripcion"
          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
            restricted ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"
          }`}
        >
          Ver suscripción
        </Link>
      </div>
    </div>
  );
}
