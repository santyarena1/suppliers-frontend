"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Pause, Play } from "lucide-react";
import { storefrontApi, type MyStorefront } from "@/lib/api";
import { checklistItems } from "@/components/storefront/StorefrontChecklist";
import { apiError, hiddenReasonText } from "@/lib/storefront";

type StoreView = Extract<MyStorefront, { exists: true }>;
type Tab = "productos" | "pedidos" | "datos";

/**
 * Arriba de todas las pestañas: si la tienda se ve, por qué no, cuánto falta y
 * el único botón que importa ahora (lo primero que falta). Reemplaza los avisos
 * de "cerrada" y "no se ve" que se repetían en cada pantalla.
 */
export default function StoreStatusHeader({
  store,
  onChange,
  onGo,
}: {
  store: StoreView;
  onChange: (next: MyStorefront) => void;
  onGo: (tab: Tab) => void;
}) {
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = checklistItems(store);
  const steps = items.filter((i) => i.state !== "warn");
  const done = steps.filter((i) => i.state === "done").length;
  const next = items.find((i) => i.state === "todo") ?? items.find((i) => i.state === "waiting");
  const closed = store.status === "CLOSED";
  const paused = store.status === "PAUSED";
  const stockWarn = store.visible && (store.stockState === "EXPIRED" || store.stockState === "DUE_SOON" || store.stockState === "UNCONFIRMED");

  async function run(key: string, fn: () => Promise<{ data: MyStorefront }>, fallback: string) {
    setWorking(key);
    setError(null);
    try {
      onChange((await fn()).data);
    } catch (err) {
      setError(apiError(err, fallback));
    } finally {
      setWorking(null);
    }
  }

  const title = store.visible ? "Tu tienda se ve" : closed ? "Tu tienda está cerrada" : paused ? "Tu tienda está pausada" : "Tu tienda todavía no se ve";
  const detail = store.visible
    ? `Aparece como «${store.name}» en el buscador de ${store.reach} ${store.reach === 1 ? "comercio" : "comercios"}${store.visibility === "PRIVATE" ? " que entraron con tu link" : ""}.`
    : closed
      ? "Nadie la ve ni te puede pedir. Al abrirla vuelve con tus productos y tus compradores."
      : (next?.detail ?? hiddenReasonText(store.hiddenReason, store.suspendedReason) ?? "Falta cargar productos con stock.");

  const primaryCls =
    "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50";
  const secondaryCls =
    "inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-50";

  function primary() {
    if (closed) {
      return (
        <button type="button" disabled={working !== null} onClick={() => void run("open", () => storefrontApi.open({}), "No se pudo abrir la tienda")} className={primaryCls}>
          {working === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Abrir la tienda
        </button>
      );
    }
    if (stockWarn) {
      return (
        <button type="button" disabled={working !== null} onClick={() => void run("confirm", () => storefrontApi.confirmStock(), "No se pudo confirmar el stock")} className={primaryCls}>
          {working === "confirm" && <Loader2 className="h-4 w-4 animate-spin" />} Mi stock está al día
        </button>
      );
    }
    const action = !store.visible ? next?.action : undefined;
    if (!action) return null;
    if (action.kind === "href") {
      return (
        <Link href={action.href} className={primaryCls}>
          {action.label}
        </Link>
      );
    }
    if (action.kind === "tab") {
      return (
        <button type="button" onClick={() => onGo(action.tab)} className={primaryCls}>
          {action.label}
        </button>
      );
    }
    if (action.kind === "confirm") {
      return (
        <button type="button" disabled={working !== null} onClick={() => void run("confirm", () => storefrontApi.confirmStock(), "No se pudo confirmar el stock")} className={primaryCls}>
          {working === "confirm" && <Loader2 className="h-4 w-4 animate-spin" />} {action.label}
        </button>
      );
    }
    return null;
  }

  const canPause = store.status === "ACTIVE" || paused;

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        store.visible ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:px-5">
        <span
          className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl ${
            store.visible ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {store.visible ? <Eye className="h-5 w-5" aria-hidden /> : <EyeOff className="h-5 w-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-base font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-surface-300">{detail}</p>
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPause && (
            <button
              type="button"
              disabled={working !== null}
              onClick={() => void run("pause", () => storefrontApi.update({ status: paused ? "ACTIVE" : "PAUSED" }), "No se pudo cambiar el estado")}
              className={secondaryCls}
              title={paused ? "Vuelve a recibir pedidos" : "Nadie la ve hasta que la reactives; no se pierde nada"}
            >
              {working === "pause" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? "Reactivar" : "Pausar"}
            </button>
          )}
          {primary()}
        </div>
      </div>
      {!store.visible && !closed && steps.length > 1 && (
        <div className="flex items-center gap-3 border-t border-amber-500/15 px-4 py-2.5 sm:px-5">
          <div className="flex flex-1 gap-1" aria-hidden>
            {steps.map((s) => (
              <span
                key={s.key}
                className={`h-1.5 flex-1 rounded-full ${s.state === "done" ? "bg-emerald-400" : s.key === next?.key ? "bg-amber-400" : "bg-surface-700"}`}
              />
            ))}
          </div>
          <span className="whitespace-nowrap text-[11px] font-medium text-surface-300">
            {done} de {steps.length} listos
          </span>
        </div>
      )}
    </section>
  );
}
