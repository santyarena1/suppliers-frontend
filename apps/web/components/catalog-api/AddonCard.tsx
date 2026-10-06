"use client";

import { useState } from "react";
import { Activity, CheckCircle2, Loader2, Plug, ShieldCheck, Zap } from "lucide-react";
import type { CatalogApiAddonState } from "@/lib/catalog-api";
import { Modal, dangerBtn, ghostBtn, primaryBtn } from "./ui";

const BENEFITS = [
  {
    icon: Zap,
    title: "Se actualiza muy seguido",
    text: "Precios y stock salen de la última sincronización de cada distribuidor, que NODO corre todo el día.",
  },
  {
    icon: ShieldCheck,
    title: "Sin caídas ni datos a medias",
    text: "Si un distribuidor se cae, tu integración sigue respondiendo con el último dato bueno y te dice qué tan fresco es.",
  },
  {
    icon: Plug,
    title: "Se integra con todo",
    text: "Tu tienda online, tu ERP, Google Merchant, el catálogo de Meta o una planilla. Con webhooks y cambios incrementales.",
  },
];

/** Estado del módulo: incluido (Custom), activo o para activar. */
export default function AddonCard({
  addon,
  canManage,
  busy,
  onToggle,
}: {
  addon: CatalogApiAddonState;
  canManage: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const [confirm, setConfirm] = useState<"on" | "off" | null>(null);
  const active = addon.includedInPlan || addon.enabled;

  return (
    <section className="relative overflow-hidden rounded-xl border border-surface-800 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-400" /> API de catálogo
            </h2>
            {addon.includedInPlan ? (
              <span className="rounded-md border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-300">
                Incluida en tu plan
              </span>
            ) : addon.enabled ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="w-3 h-3" /> {addon.courtesy ? "Activa · de cortesía" : "Activa"}
              </span>
            ) : (
              <span className="rounded-md border border-surface-700 bg-surface-800 px-1.5 py-0.5 text-[11px] font-medium text-surface-400">
                No activa
              </span>
            )}
          </div>
          <p className="mt-1.5 max-w-xl text-sm text-surface-300 leading-relaxed">
            Conectá tu catálogo de NODO a cualquier sistema: todos tus distribuidores, con precio, impuestos, stock, fotos y
            ficha completa, en una API con key y secret.
          </p>
        </div>
        {!addon.includedInPlan && addon.courtesy && addon.enabled && (
          <div className="flex-shrink-0 sm:text-right">
            <p className="text-lg font-semibold text-emerald-300 leading-none">Sin cargo</p>
            <p className="mt-1 text-[11px] text-surface-500">Te la regalamos: no se suma a tu mensualidad.</p>
          </div>
        )}
        {!addon.includedInPlan && !(addon.courtesy && addon.enabled) && (
          <div className="flex-shrink-0 sm:text-right">
            <p className="text-2xl font-bold text-white tabular-nums leading-none">
              US$ {addon.priceUsd}
              <span className="ml-1 text-xs font-normal text-surface-400">/ mes</span>
            </p>
            <p className="mt-1 text-[11px] text-surface-500">Módulo extra · incluido en Custom</p>
            {canManage && (
              <div className="mt-3">
                {addon.enabled ? (
                  <button type="button" disabled={busy} onClick={() => setConfirm("off")} className={ghostBtn}>
                    Desactivar
                  </button>
                ) : (
                  <button type="button" disabled={busy} onClick={() => setConfirm("on")} className={primaryBtn}>
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Activar el módulo
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!active && (
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-lg border border-surface-800 bg-surface-950/60 p-3">
            <Icon className="w-4 h-4 text-brand-400" />
            <p className="mt-2 text-xs font-semibold text-white">{title}</p>
            <p className="mt-1 text-[11px] text-surface-400 leading-relaxed">{text}</p>
          </li>
        ))}
      </ul>
      )}

      {!active && !canManage && (
        <p className="mt-4 text-xs text-surface-500">Pedile al dueño de la organización que active el módulo.</p>
      )}

      {confirm === "on" && (
        <Modal title="Activar la API de catálogo" onClose={() => setConfirm(null)}>
          <p className="text-sm text-surface-300 leading-relaxed">
            Se suman <span className="font-semibold text-white">US$ {addon.priceUsd} por mes</span> a tu próximo pago, junto con tu
            plan. Podés crear las keys apenas lo activás y desactivarlo cuando quieras.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={ghostBtn}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onToggle(true);
                setConfirm(null);
              }}
              className={primaryBtn}
            >
              Activar por US$ {addon.priceUsd}/mes
            </button>
          </div>
        </Modal>
      )}
      {confirm === "off" && (
        <Modal title="Desactivar la API de catálogo" onClose={() => setConfirm(null)}>
          <p className="text-sm text-surface-300 leading-relaxed">
            Tus keys y webhooks quedan guardados pero <span className="font-semibold text-white">dejan de responder</span> enseguida:
            cualquier tienda o sistema conectado deja de recibir el catálogo. Deja de sumarse a tu próximo pago.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className={ghostBtn}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onToggle(false);
                setConfirm(null);
              }}
              className={dangerBtn}
            >
              Desactivar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
