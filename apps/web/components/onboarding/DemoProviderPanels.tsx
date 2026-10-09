"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, KeyRound, Lock, RefreshCw, Sparkles } from "lucide-react";
import { ordersApi, type TenantOrder } from "@/lib/api";
import { formatUSD } from "@/lib/format";

/**
 * Pestañas de ejemplo para los distribuidores del recorrido guiado (LIST_DEMO_*).
 * Muestran cómo se ve un distribuidor con integración (cuenta, sincronización,
 * cuenta corriente con facturas) sin llamar a ningún portal ni guardar nada.
 */

export function isDemoProvider(provider: string): boolean {
  return provider.startsWith("LIST_DEMO_");
}

function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-200">
      <Sparkles className="w-3 h-3" /> Ejemplo
    </span>
  );
}

const DAY_MS = 86_400_000;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "Mi cuenta": el formulario que se llena con el usuario del portal. */
export function DemoCredentialsCard({ providerName }: { providerName: string }) {
  return (
    <div className="max-w-xl border border-surface-800 rounded-xl p-5 flex flex-col gap-4" data-tour="provider-tab-content">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="w-4 h-4 text-brand-400" /> Tu cuenta en {providerName}
        </div>
        <DemoBadge />
      </div>
      <p className="text-xs text-surface-400 leading-relaxed">
        Con un distribuidor real cargás acá el mismo usuario y contraseña con el que entrás a su portal. NODO trae tus
        precios y stock solo, cada hora, y te avisa si la cuenta deja de funcionar.
      </p>
      {[
        ["Usuario o email del portal", "compras@tulocal.com.ar"],
        ["Contraseña", "••••••••••"],
      ].map(([label, value]) => (
        <label key={label} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-surface-400">{label}</span>
          <input
            value={value}
            readOnly
            disabled
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-surface-300 cursor-not-allowed"
          />
        </label>
      ))}
      <p className="flex items-center gap-2 text-[11px] text-surface-500">
        <Lock className="w-3.5 h-3.5" /> Las cuentas se guardan cifradas y solo las usa NODO para traer tus precios.
      </p>
    </div>
  );
}

/** "Sincronización": cómo se ve el historial de corridas. */
export function DemoSyncPanel({ providerName }: { providerName: string }) {
  // Horarios relativos a ahora: se arman después de montar (la hora no va en el render).
  const [runs, setRuns] = useState<{ at: Date; created: number; updated: number; ok: boolean }[]>([]);
  useEffect(() => {
    const now = Date.now();
    setRuns(
      [0, 1, 2, 3, 4].map((i) => ({
        at: new Date(now - (i * 60 + 12) * 60_000),
        created: i === 3 ? 14 : i === 0 ? 2 : 0,
        updated: [318, 207, 296, 341, 188][i],
        ok: i !== 2,
      }))
    );
  }, []);
  return (
    <div className="max-w-xl flex flex-col gap-4" data-tour="provider-tab-content">
      <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <RefreshCw className="w-4 h-4 text-brand-400" /> Sincronización automática
          </div>
          <DemoBadge />
        </div>
        <p className="text-xs text-surface-400 leading-relaxed">
          Con un distribuidor con integración, NODO trae su catálogo con tus precios cada hora. Si el portal falla, lo
          reintenta y, si falla 3 veces seguidas, lo pausa y te avisa con «Sync pausado por error de {providerName}»: sus
          productos salen del buscador hasta que lo reactives.
        </p>
        <div className="flex items-center justify-between rounded-lg bg-surface-800 px-3.5 py-2.5 text-xs">
          <span className="text-surface-300">Cada 1 hora</span>
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> Activa
          </span>
        </div>
      </div>
      <div className="border border-surface-800 rounded-xl overflow-hidden">
        <p className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-surface-500 border-b border-surface-800">
          Últimas sincronizaciones
        </p>
        <ul className="divide-y divide-surface-800">
          {runs.map((run) => (
            <li key={run.at.toISOString()} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
              <span className="text-surface-300 tabular-nums">
                {run.at.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </span>
              {run.ok ? (
                <span className="text-surface-400">
                  {run.created > 0 && <>{run.created} nuevos · </>}
                  {run.updated} actualizados
                </span>
              ) : (
                <span className="text-amber-300">El portal no respondió · se reintentó solo</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type DemoInvoice = {
  number: string;
  orderNumber: string;
  date: Date;
  due: Date;
  net: number;
  iva: number;
  perceptions: number;
  total: number;
  paid: boolean;
  items: TenantOrder["items"];
};

function invoicesFrom(orders: TenantOrder[], provider: string): DemoInvoice[] {
  return orders
    .filter((o) => o.provider === provider && o.channel !== "OFFLINE" && o.orderNumber)
    .slice(0, 8)
    .map((o, i) => {
      const date = new Date(o.createdAt);
      const lines = o.items ?? [];
      const net = lines.reduce((sum, it) => sum + (it.lineTotal ?? (it.unitPrice ?? it.price ?? 0) * (it.qty ?? 1)), 0);
      const iva = lines.reduce(
        (sum, it) => sum + (it.lineTotal ?? (it.unitPrice ?? it.price ?? 0) * (it.qty ?? 1)) * ((it.ivaPercent ?? 21) / 100),
        0
      );
      const perceptions = Math.round(net * 0.03 * 100) / 100;
      const total = Math.round((net + iva + perceptions) * 100) / 100;
      return {
        number: `A 0004-${String(18230 + 40 - i).padStart(8, "0")}`,
        orderNumber: o.orderNumber!,
        date,
        due: new Date(date.getTime() + 30 * DAY_MS),
        net,
        iva,
        perceptions,
        total,
        // Las de más de un mes ya están pagas: el saldo es lo último.
        paid: Date.now() - date.getTime() > 30 * DAY_MS,
        items: lines,
      };
    });
}

/** "Pedidos y Cta. Cte.": facturas de los pedidos online de ejemplo y su detalle. */
export function DemoAccountPanel({ provider, providerName }: { provider: string; providerName: string }) {
  const [orders, setOrders] = useState<TenantOrder[] | null>(null);
  const [openNumber, setOpenNumber] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ordersApi
      .list()
      .then((res) => alive && setOrders(Array.isArray(res.data) ? res.data : []))
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
  }, []);

  const invoices = useMemo(() => (orders ? invoicesFrom(orders, provider) : []), [orders, provider]);

  // Abre la factura del pedido que pidió la URL (?invoice=) o la más reciente.
  useEffect(() => {
    if (invoices.length === 0 || openNumber) return;
    const wanted = new URLSearchParams(window.location.search).get("invoice");
    setOpenNumber(invoices.find((inv) => inv.orderNumber === wanted)?.orderNumber ?? invoices[0].orderNumber);
  }, [invoices, openNumber]);

  if (orders === null) {
    return <p className="text-xs text-surface-500 py-6">Cargando la cuenta corriente…</p>;
  }
  if (invoices.length === 0) {
    return (
      <p className="text-xs text-surface-500 py-6">
        Todavía no hay pedidos online de ejemplo con {providerName}. Volvé a cargar la demo desde Configuración → Ayuda.
      </p>
    );
  }

  const balance = invoices.filter((inv) => !inv.paid).reduce((sum, inv) => sum + inv.total, 0);
  const open = invoices.find((inv) => inv.orderNumber === openNumber) ?? null;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Cuenta corriente con {providerName}</p>
          <p className="text-xs text-surface-500 mt-0.5">
            Con un distribuidor con integración, esto viene de su portal: facturas, vencimientos y tu saldo.
          </p>
        </div>
        <DemoBadge />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Saldo a pagar</p>
          <p className="text-lg font-semibold text-white tabular-nums mt-1">{formatUSD(balance)}</p>
        </div>
        <div className="rounded-xl border border-surface-800 bg-surface-900 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Facturas</p>
          <p className="text-lg font-semibold text-white tabular-nums mt-1">{invoices.length}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {invoices.map((inv) => {
          const isOpen = inv.orderNumber === openNumber;
          return (
            <li key={inv.number} className="rounded-xl border border-surface-800 bg-surface-900">
              <button
                type="button"
                onClick={() => setOpenNumber(isOpen ? null : inv.orderNumber)}
                className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  <span className="text-sm text-white font-medium">Factura {inv.number}</span>
                  <span className="text-[11px] text-surface-500 font-mono">pedido #{inv.orderNumber}</span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-surface-400">{fmtDate(inv.date)}</span>
                  <span className="tabular-nums text-white font-semibold">{formatUSD(inv.total)}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      inv.paid ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
                    }`}
                  >
                    {inv.paid ? "Pagada" : `Vence ${fmtDate(inv.due)}`}
                  </span>
                </span>
              </button>
              {isOpen && open && <InvoiceDetail invoice={open} providerName={providerName} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InvoiceDetail({ invoice, providerName }: { invoice: DemoInvoice; providerName: string }) {
  return (
    <div className="border-t border-surface-800 px-4 py-4 flex flex-col gap-3" data-tour="demo-invoice">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-surface-400">
        <span>
          {providerName} · Factura {invoice.number}
        </span>
        <span>
          Emitida {fmtDate(invoice.date)} · vence {fmtDate(invoice.due)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-surface-500 border-b border-surface-800">
              <th className="py-1.5 pr-3 font-medium">Producto</th>
              <th className="py-1.5 px-2 font-medium text-right">Cant.</th>
              <th className="py-1.5 px-2 font-medium text-right">Unitario</th>
              <th className="py-1.5 pl-2 font-medium text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it, i) => {
              const unit = it.unitPrice ?? it.price ?? 0;
              const qty = it.qty ?? 1;
              return (
                <tr key={`${it.externalId ?? i}`} className="border-b border-surface-800/60">
                  <td className="py-1.5 pr-3 text-surface-200">{it.name}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-surface-300">{qty}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-surface-300">{formatUSD(unit)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-surface-200">{formatUSD(it.lineTotal ?? unit * qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-xs min-w-[220px]">
        <dt className="text-surface-500">Neto</dt>
        <dd className="text-right tabular-nums text-surface-200">{formatUSD(invoice.net)}</dd>
        <dt className="text-surface-500">IVA</dt>
        <dd className="text-right tabular-nums text-surface-200">{formatUSD(invoice.iva)}</dd>
        <dt className="text-surface-500">Percepciones IIBB</dt>
        <dd className="text-right tabular-nums text-surface-200">{formatUSD(invoice.perceptions)}</dd>
        <dt className="text-white font-semibold">Total</dt>
        <dd className="text-right tabular-nums text-white font-semibold">{formatUSD(invoice.total)}</dd>
      </dl>
    </div>
  );
}

/** "Listas": cómo queda una lista de precios subida en Excel. */
export function DemoListsPanel({ providerName }: { providerName: string }) {
  const [uploadedAt, setUploadedAt] = useState<Date | null>(null);
  useEffect(() => setUploadedAt(new Date(Date.now() - 2 * DAY_MS)), []);
  const columns: [string, string][] = [
    ["Código", "SKU"],
    ["Descripción", "Nombre del producto"],
    ["Precio s/IVA", "Precio neto (USD)"],
    ["% IVA", "Alícuota de IVA"],
    ["Stock", "Stock"],
  ];
  return (
    <div className="max-w-3xl flex flex-col gap-4" data-tour="provider-tab-content">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Lista de precios de {providerName}</p>
          <p className="text-xs text-surface-500 mt-0.5">
            Subís el Excel tal como te lo manda el distribuidor. NODO reconoce las columnas solo; la primera vez te
            pide que confirmes cómo las leyó.
          </p>
        </div>
        <DemoBadge />
      </div>
      <div className="rounded-xl border border-dashed border-surface-700 px-4 py-6 text-center text-xs text-surface-500">
        Con un distribuidor real, arrastrá acá su lista (.xlsx, .xls o .csv).
      </div>
      <div className="rounded-xl border border-surface-800 bg-surface-900 p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-white font-medium">
            <FileText className="w-4 h-4 text-brand-400" /> lista-{providerName.toLowerCase().replace(/\s+/g, "-")}.xlsx
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" /> Aplicada {uploadedAt ? fmtDate(uploadedAt) : ""}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-surface-500 border-b border-surface-800">
              <th className="py-1.5 pr-3 font-medium">Columna del Excel</th>
              <th className="py-1.5 font-medium">Se lee como</th>
            </tr>
          </thead>
          <tbody>
            {columns.map(([from, to]) => (
              <tr key={from} className="border-b border-surface-800/60">
                <td className="py-1.5 pr-3 font-mono text-surface-300">{from}</td>
                <td className="py-1.5 text-surface-200">{to}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-surface-500">
          Vigencia: cada 7 días. Cuando se vence te avisamos; los precios se siguen viendo, marcados como vencidos,
          hasta que subas la nueva. Lo que no viene en la lista nueva deja de mostrarse.
        </p>
      </div>
    </div>
  );
}
