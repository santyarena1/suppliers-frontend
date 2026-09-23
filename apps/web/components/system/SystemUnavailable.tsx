"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import DataField from "@/components/landing/DataField";
import type { SystemHealthKind } from "@/lib/system-health";
import "@/app/(marketing)/landing.css";
import "@/app/system-status.css";

export type SystemUnavailableVariant = SystemHealthKind | "error" | "maintenance";

const COPY: Record<
  Exclude<SystemUnavailableVariant, "ok">,
  { label: string; title: string; lead: string }
> = {
  maintenance: {
    label: "Actualización",
    title: "Estamos actualizando NODO",
    lead: "En unos minutos vuelve a estar disponible. Tus datos y pedidos quedan guardados.",
  },
  updating: {
    label: "En proceso",
    title: "Estamos aplicando una actualización",
    lead: "El sistema está reiniciando servicios. Probá de nuevo en unos segundos.",
  },
  down: {
    label: "No disponible",
    title: "NODO no está disponible por un momento",
    lead: "Puede ser una caída puntual o un corte de conexión. Reintentá en unos segundos.",
  },
  error: {
    label: "Interrupción",
    title: "Algo falló al cargar esta pantalla",
    lead: "No es un problema de tu cuenta. Reintentá; si sigue, esperá un minuto y volvé.",
  },
};

type Props = {
  variant?: Exclude<SystemUnavailableVariant, "ok">;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Si true, no muestra link a la marca (útil en overlay a pantalla completa). */
  brandAsText?: boolean;
};

export default function SystemUnavailable({
  variant = "down",
  message,
  onRetry,
  retryLabel = "Reintentar",
  brandAsText = false,
}: Props) {
  const copy = COPY[variant];
  const lead = message?.trim() || copy.lead;

  const brandInner = (
    <>
      <NodoLogo className="w-7 h-7" />
      <span>
        <NodoWordmark className="h-3.5" />
        <em className="lnd-mono">Buscador mayorista</em>
      </span>
    </>
  );

  return (
    <main className="lnd sys" role="alert" aria-live="polite">
      <DataField className="sys__field" />
      <div className="lnd-vignette" aria-hidden="true" />
      <div className="lnd-grain" aria-hidden="true" />

      <div className="sys__wrap">
        {brandAsText ? (
          <div className="sys__brand">{brandInner}</div>
        ) : (
          <Link href="/landing" className="sys__brand">
            {brandInner}
          </Link>
        )}

        <div className="sys__pulse" aria-hidden="true">
          <NodoLogo className="w-5 h-5" />
        </div>

        <div className="sys__copy">
          <p className="lnd-label">{copy.label}</p>
          <h1 className="lnd-display lnd-display--md sys__title">{copy.title}</h1>
          <p className="sys__lead">{lead}</p>
        </div>

        {onRetry && (
          <div className="sys__actions">
            <button type="button" className="lnd-btn lnd-btn--primary" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5" />
              {retryLabel}
            </button>
            <p className="sys__hint lnd-mono">Se reintenta solo cada pocos segundos</p>
          </div>
        )}

        <p className="sys__legal lnd-mono">© {new Date().getFullYear()} NODO</p>
      </div>
    </main>
  );
}
