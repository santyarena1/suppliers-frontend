"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, Package, RefreshCw, Users, Workflow } from "lucide-react";
import { storefrontApi, type MyStorefront } from "@/lib/api";
import StorefrontChecklist, { checklistItems } from "@/components/storefront/StorefrontChecklist";
import CustomPlanModal from "@/components/custom/CustomPlanModal";
import { ago, apiError, STOCK_DAY_OPTIONS, untilText } from "@/lib/storefront";

type StoreView = Extract<MyStorefront, { exists: true }>;

/**
 * Resumen de la tienda. El estado (si se ve y por qué) está en StoreStatusHeader;
 * acá van los pasos que faltan mientras se arma, el stock confirmado y los números.
 */
export default function StorefrontOverview({
  store,
  onChange,
  onGo,
}: {
  store: StoreView;
  onChange: (next: MyStorefront) => void;
  onGo: (tab: "productos" | "pedidos" | "datos") => void;
}) {
  const [working, setWorking] = useState<"confirm" | "pause" | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [erpOpen, setErpOpen] = useState(false);
  const expiresIn = untilText(store.stockExpiresAt);
  const paused = store.status === "PAUSED";
  const stockWarn = store.stockState === "EXPIRED" || store.stockState === "DUE_SOON" || store.stockState === "UNCONFIRMED";

  async function confirmStock() {
    setWorking("confirm");
    setAviso(null);
    try {
      const res = await storefrontApi.confirmStock();
      onChange(res.data);
      setAviso({
        ok: true,
        text: store.stockValidDays > 0 ? `Stock confirmado. Te lo volvemos a pedir en ${store.stockValidDays} ${store.stockValidDays === 1 ? "día" : "días"}.` : "Stock confirmado.",
      });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo confirmar el stock") });
    } finally {
      setWorking(null);
    }
  }

  async function togglePause() {
    setWorking("pause");
    setAviso(null);
    try {
      const res = await storefrontApi.update({ status: paused ? "ACTIVE" : "PAUSED" });
      onChange(res.data);
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo cambiar el estado") });
    } finally {
      setWorking(null);
    }
  }

  const stats = [
    { icon: Package, label: "Productos", value: store.productCount, sub: `${store.inStockCount} con stock`, tab: "productos" as const },
    { icon: ClipboardList, label: "Pedidos por confirmar", value: store.pendingOrders, sub: "de otros comercios", tab: "pedidos" as const },
    {
      icon: Users,
      label: "Comercios que la ven",
      value: store.reach,
      sub: store.visibility === "PRIVATE" ? "tienda privada · con tu link" : `${store.audience.pending} todavía no eligieron`,
      tab: "datos" as const,
    },
  ];

  const items = checklistItems(store);
  const settingUp = items.some((i) => i.state === "todo" || i.state === "blocked");
  const hasProducts = store.productCount > 0;

  return (
    <div className="flex flex-col gap-4">
      {settingUp && (
        <StorefrontChecklist
          store={store}
          working={working}
          onGo={onGo}
          onReactivate={() => void togglePause()}
          onConfirmStock={() => void confirmStock()}
        />
      )}

      {store.status === "ACTIVE" && hasProducts && (
        <section
          className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${
            stockWarn ? "border-amber-500/40 bg-amber-500/10" : "border-surface-800 bg-surface-900"
          }`}
        >
          <RefreshCw className="hidden h-4 w-4 text-surface-400 sm:block" aria-hidden />
          <div className="min-w-[220px] flex-1 basis-72 text-xs leading-relaxed">
            <p className="text-surface-200">
              Stock confirmado <span className="font-semibold text-white">{ago(store.stockConfirmedAt)}</span>
              {store.stockValidDays === 0 ? null : expiresIn ? (
                <>
                  {" "}
                  · {store.stockState === "DUE_SOON" ? "hay que confirmarlo" : "próximo aviso"} <span className="font-semibold text-white">{expiresIn}</span>
                </>
              ) : store.stockConfirmedAt ? (
                <span className="font-semibold text-amber-300"> · sin confirmar</span>
              ) : null}
            </p>
            <p className={stockWarn ? "text-amber-100/80" : "text-surface-500"}>
              {store.stockState === "EXPIRED"
                ? store.staleAction === "HIDE"
                  ? "Tu tienda está oculta hasta que confirmes el stock."
                  : "Los compradores ven que tu stock no está confirmado. Actualizá lo que vendiste por otro lado y confirmalo."
                : store.stockValidDays === 0
                  ? "No te pedimos confirmarlo. Si vendés algo por otro lado, bajá el stock en Productos."
                  : `Si vendés algo por otro lado, bajá el stock en Productos. Te lo pedimos ${
                      STOCK_DAY_OPTIONS.find((o) => o.value === store.stockValidDays)?.label.toLowerCase() ?? `cada ${store.stockValidDays} días`
                    }.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void confirmStock()}
            disabled={working !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-3 py-2 text-xs font-semibold text-white hover:border-surface-400 disabled:opacity-50"
          >
            {working === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Mi stock está al día
          </button>
        </section>
      )}
      {aviso && (
        <p className={`rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}

      {hasProducts && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onGo(s.tab)}
              className="group rounded-2xl border border-surface-800 bg-surface-900 p-4 text-left transition-colors hover:border-surface-600"
            >
              <s.icon className="h-4 w-4 text-brand-300" aria-hidden />
              <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{s.value}</p>
              <p className="text-xs text-surface-300">{s.label}</p>
              <p className="text-[11px] text-surface-500">{s.sub}</p>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setErpOpen(true)}
        className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.07] to-transparent p-4 text-left transition-colors hover:border-emerald-400/40"
      >
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Workflow className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">¿Tu stock está en un sistema de gestión?</span>
          <span className="block text-xs leading-relaxed text-surface-400">
            Con NODO Custom lo conectamos: el stock y los precios de tu tienda se actualizan solos y cada venta descuenta en tu sistema.
          </span>
        </span>
        <span className="hidden whitespace-nowrap text-xs font-semibold text-emerald-300 sm:block">Conectá tu sistema →</span>
      </button>
      <CustomPlanModal open={erpOpen} onClose={() => setErpOpen(false)} />
    </div>
  );
}
