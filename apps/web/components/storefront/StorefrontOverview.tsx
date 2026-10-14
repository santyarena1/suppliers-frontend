"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, Eye, EyeOff, Loader2, Package, PlugZap, RefreshCw, Store, Users } from "lucide-react";
import { storefrontApi, type MyStorefront } from "@/lib/api";
import { ago, apiError, hiddenReasonText, untilText } from "@/lib/storefront";

type StoreView = Extract<MyStorefront, { exists: true }>;

/** Resumen de la tienda: si se ve, por qué no, el stock confirmado y los números. */
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
  const reason = hiddenReasonText(store.hiddenReason, store.suspendedReason);
  const expiresIn = untilText(store.stockExpiresAt);
  const paused = store.status === "PAUSED";

  async function confirmStock() {
    setWorking("confirm");
    setAviso(null);
    try {
      const res = await storefrontApi.confirmStock();
      onChange(res.data);
      setAviso({ ok: true, text: `Stock confirmado. Vale por ${store.stockValidDays} días.` });
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
    { icon: Users, label: "Comercios que la ven", value: store.reach, sub: "en NODO", tab: null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section
        className={`rounded-2xl border p-5 ${
          store.visible ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${
                store.visible ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {store.visible ? <Eye className="h-5 w-5" aria-hidden /> : <EyeOff className="h-5 w-5" aria-hidden />}
            </span>
            <div>
              <p className="text-base font-semibold text-white">
                {store.visible ? "Tu tienda se ve en NODO" : "Tu tienda no se ve todavía"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-surface-300">
                {store.visible
                  ? `Aparece como "${store.name}" en el buscador de los demás comercios.`
                  : reason ?? "Cargá productos con stock para que aparezca."}
              </p>
            </div>
          </div>
          {store.status !== "SUSPENDED" && (
            <button
              type="button"
              onClick={() => void togglePause()}
              disabled={working !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-200 hover:text-white disabled:opacity-50"
            >
              {working === "pause" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {paused ? "Reactivar tienda" : "Pausar tienda"}
            </button>
          )}
        </div>

        {store.status === "ACTIVE" && store.productCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-surface-800 bg-surface-950/40 px-4 py-3">
            <RefreshCw className="hidden h-4 w-4 text-surface-400 sm:block" aria-hidden />
            <div className="min-w-[220px] flex-1 basis-72 text-xs leading-relaxed">
              <p className="text-surface-200">
                Stock confirmado <span className="font-semibold text-white">{ago(store.stockConfirmedAt)}</span>
                {expiresIn ? (
                  <>
                    {" "}
                    · vence <span className="font-semibold text-white">{expiresIn}</span>
                  </>
                ) : store.stockConfirmedAt ? (
                  <span className="text-amber-300"> · vencido</span>
                ) : null}
              </p>
              <p className="text-surface-500">
                Si vendés algo por otro lado, actualizalo. Cada {store.stockValidDays} días te pedimos que lo confirmes para que
                nadie pida algo que ya no tenés.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void confirmStock()}
              disabled={working !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {working === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mi stock está al día
            </button>
          </div>
        )}
        {aviso && (
          <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
            {aviso.text}
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const body = (
            <>
              <s.icon className="h-4 w-4 text-brand-300" aria-hidden />
              <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{s.value}</p>
              <p className="text-xs text-surface-300">{s.label}</p>
              <p className="text-[11px] text-surface-500">{s.sub}</p>
            </>
          );
          return s.tab ? (
            <button
              key={s.label}
              type="button"
              onClick={() => onGo(s.tab!)}
              className="rounded-2xl border border-surface-800 bg-surface-900 p-4 text-left transition-colors hover:border-surface-600"
            >
              {body}
            </button>
          ) : (
            <div key={s.label} className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
              {body}
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-brand-300" aria-hidden />
          <h2 className="text-sm font-semibold text-white">Cómo funciona</h2>
        </div>
        <ol className="mt-3 grid gap-2 text-xs leading-relaxed text-surface-300 sm:grid-cols-3">
          <li className="rounded-xl border border-surface-800 bg-surface-950/40 p-3">
            <span className="font-semibold text-white">1. Publicás.</span> Subís tu planilla o cargás productos a mano, con
            precio y stock.
          </li>
          <li className="rounded-xl border border-surface-800 bg-surface-950/40 p-3">
            <span className="font-semibold text-white">2. Te encuentran.</span> Los demás comercios te ven en el buscador como
            un proveedor más, marcado como local.
          </li>
          <li className="rounded-xl border border-surface-800 bg-surface-950/40 p-3">
            <span className="font-semibold text-white">3. Confirmás.</span> Te llega el pedido, lo confirmás o lo rechazás, y
            coordinan pago y entrega entre ustedes.
          </li>
        </ol>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-dashed border-surface-700 bg-surface-900/50 p-5">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-surface-800 text-surface-300">
          <PlugZap className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            Conexión con tu sistema de gestión
            <span className="rounded-full border border-surface-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface-300">
              Próximamente
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-surface-400">
            Tu stock y tus precios se van a actualizar solos desde tu sistema, y cada venta en NODO va a descontar allá.
            Mientras tanto, la planilla y el botón de confirmar stock te mantienen al día.
          </p>
        </div>
      </section>
    </div>
  );
}
