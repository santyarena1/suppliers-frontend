"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, CreditCard, Loader2, Lock, Search, Send, Sparkles } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import PlanComparison from "@/components/subscription/PlanComparison";
import { invalidateMyProviders, subscriptionApi } from "@/lib/api";
import { formatUsd, PLAN_CATALOG, type MySubscription, type TenantPlan } from "@/lib/plans";
import { invalidateSubscription, useSubscription } from "@/lib/subscription";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  TRIAL: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  PAST_DUE: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  GRACE_PERIOD: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  SUSPENDED: "bg-red-500/10 text-red-300 border-red-500/30",
  CANCELLED: "bg-surface-800 text-surface-300 border-surface-700",
  COURTESY: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

/** "Plan y facturación" del comercio: plan, vencimientos, uso del buscador y pagos. */
export default function SubscriptionPage() {
  const { subscription, loading } = useSubscription();
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Plan y facturación</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Tu plan de NODO, vencimientos y pagos</p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : !subscription ? (
            <p className="text-sm text-surface-400">No pudimos cargar tu suscripción. Probá de nuevo en un rato.</p>
          ) : (
            <>
              <StatusNotice sub={subscription} />
              <PlanSummary sub={subscription} onMessage={setAviso} />
              <SearchUsageCard sub={subscription} />
              <PaymentNotice sub={subscription} onMessage={setAviso} />
              <PaymentHistory sub={subscription} />

              <section className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setShowPlans((v) => !v)}
                  className="self-start inline-flex items-center gap-1.5 text-xs font-medium text-brand-300 hover:text-brand-200"
                  aria-expanded={showPlans}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPlans ? "rotate-180" : ""}`} />
                  Ver todas las funciones de cada plan
                </button>
                {showPlans && <PlanComparison current={subscription.plan} />}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatusNotice({ sub }: { sub: MySubscription }) {
  if (sub.status === "SUSPENDED" || (sub.status === "CANCELLED" && sub.access === "RESTRICTED")) {
    return (
      <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
        <div className="text-sm text-surface-100">
          <p className="font-semibold text-white">Tu cuenta está suspendida</p>
          <p className="mt-1 text-surface-300">
            No se borró ningún dato. Podés ver tus pedidos, proveedores y equipo; para volver a buscar y comprar, regularizá el
            pago. Apenas se registre, NODO vuelve a funcionar.
          </p>
        </div>
      </div>
    );
  }
  if (sub.status === "PAST_DUE" || sub.status === "GRACE_PERIOD") {
    return (
      <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
        <div className="text-sm">
          <p className="font-semibold text-white">Tu suscripción venció. Regularizá el pago para mantener NODO activo.</p>
          <p className="mt-1 text-surface-300">
            {sub.suspendsAt ? `Seguís operando normalmente hasta el ${fmtDate(sub.suspendsAt)}.` : "Seguís operando normalmente por unos días."}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function PlanSummary({ sub, onMessage }: { sub: MySubscription; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const [busy, setBusy] = useState<TenantPlan | null>(null);
  const plan = PLAN_CATALOG[sub.plan];
  const due = sub.dueAt ?? sub.nextBillingAt;

  async function upgrade(target: TenantPlan) {
    setBusy(target);
    try {
      const res = await subscriptionApi.upgrade(target);
      invalidateSubscription();
      invalidateMyProviders();
      onMessage({
        ok: true,
        text: res.data.applied
          ? `Listo: ya estás en ${PLAN_CATALOG[target].label}.`
          : `Recibimos tu solicitud de ${PLAN_CATALOG[target].label}. Te contactamos para activarlo.`,
      });
    } catch (err) {
      onMessage({ ok: false, text: errMsg(err, "No se pudo cambiar el plan") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-surface-500">Tu plan</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-white">{plan.label}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[sub.status] ?? STATUS_TONE.ACTIVE}`}>
              {sub.statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-surface-400">{plan.tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-white">
            {formatUsd(sub.price)}
            <span className="text-sm font-normal text-surface-400"> / mes</span>
          </p>
          {sub.plan === "CUSTOM" && sub.setupFee.amount != null && (
            <p className="mt-1 text-xs text-surface-400">
              Puesta en marcha {formatUsd(sub.setupFee.amount)} · {sub.setupFee.statusLabel}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fact
          icon={<CalendarClock className="h-4 w-4" />}
          label={sub.status === "TRIAL" ? "Fin de la prueba" : "Próximo vencimiento"}
          value={fmtDate(due) ?? "Sin vencimiento"}
        />
        <Fact
          icon={<CreditCard className="h-4 w-4" />}
          label="Período actual"
          value={
            sub.currentPeriodStart && sub.currentPeriodEnd
              ? `${fmtDate(sub.currentPeriodStart)} – ${fmtDate(sub.currentPeriodEnd)}`
              : "—"
          }
        />
        <Fact
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Estado"
          value={
            sub.daysOverdue != null
              ? `Vencida hace ${sub.daysOverdue} ${sub.daysOverdue === 1 ? "día" : "días"}`
              : sub.daysUntilDue != null
                ? `Vence en ${sub.daysUntilDue} ${sub.daysUntilDue === 1 ? "día" : "días"}`
                : sub.statusLabel
          }
        />
      </dl>

      {sub.plan !== "CUSTOM" && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-surface-800 pt-4">
          {sub.canManage ? (
            <>
              {sub.plan === "BASE" && (
                <button
                  type="button"
                  onClick={() => upgrade("PRO")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {busy === "PRO" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Pasar a NODO Pro · {formatUsd(PLAN_CATALOG.PRO.monthlyPrice)}/mes
                </button>
              )}
              <button
                type="button"
                onClick={() => upgrade("CUSTOM")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-xl border border-surface-700 px-4 py-2 text-sm text-surface-200 hover:bg-surface-800 disabled:opacity-50"
              >
                {busy === "CUSTOM" && <Loader2 className="h-4 w-4 animate-spin" />}
                Consultar por NODO Custom
              </button>
            </>
          ) : (
            <p className="text-xs text-surface-400">Para cambiar de plan, pedíselo al dueño de tu organización.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-800 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-surface-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm text-white">{value}</dd>
    </div>
  );
}

function SearchUsageCard({ sub }: { sub: MySubscription }) {
  const { usage } = sub;
  const limited = usage.maxSearchProviders != null;
  return (
    <section className="rounded-2xl border border-surface-800 p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
        <Search className="h-4 w-4 text-surface-400" /> Distribuidores
      </h2>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm text-surface-300">
          <p>
            Proveedores conectados: <strong className="text-white">{usage.connectedProviders}</strong>
          </p>
          <p className="mt-1">
            {limited ? (
              <>
                Activos en búsqueda:{" "}
                <strong className="text-white">
                  {usage.activeSearchProviders} / {usage.maxSearchProviders}
                </strong>
              </>
            ) : (
              <>
                Distribuidores ilimitados en búsqueda · <strong className="text-white">{usage.activeSearchProviders}</strong> activos
              </>
            )}
          </p>
        </div>
        <Link href="/proveedores" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
          {limited ? "Elegir en qué distribuidores buscar" : "Ver proveedores"}
        </Link>
      </div>
      {limited && (
        <p className="mt-3 text-xs text-surface-500">
          Todos tus distribuidores quedan conectados. Con NODO Pro buscás en todos a la vez.
        </p>
      )}
    </section>
  );
}

function PaymentNotice({ sub, onMessage }: { sub: MySubscription; onMessage: (m: { ok: boolean; text: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const urgent = sub.status === "PAST_DUE" || sub.status === "GRACE_PERIOD" || sub.access === "RESTRICTED";

  async function send() {
    setBusy(true);
    try {
      await subscriptionApi.paymentNotice({ reference: reference.trim() || undefined, message: message.trim() || undefined });
      setOpen(false);
      setReference("");
      setMessage("");
      onMessage({ ok: true, text: "Gracias. Avisamos a NODO: apenas se confirme el pago se actualiza tu suscripción." });
    } catch (err) {
      onMessage({ ok: false, text: errMsg(err, "No se pudo enviar el aviso") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`rounded-2xl border p-5 ${urgent ? "border-amber-500/30" : "border-surface-800"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">¿Ya pagaste?</h2>
          <p className="mt-1 text-xs text-surface-400">Avisanos con el número de transferencia o comprobante y lo registramos.</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-700 px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-800"
          >
            <Send className="h-3.5 w-3.5" /> Informar un pago
          </button>
        )}
      </div>
      {open && (
        <div className="mt-4 grid gap-3">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Nº de transferencia o comprobante"
            className="w-full rounded-md border border-surface-700 bg-surface-800 px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Comentario (opcional)"
            className="w-full rounded-md border border-surface-700 bg-surface-800 px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:border-brand-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enviar aviso
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-surface-400 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PaymentHistory({ sub }: { sub: MySubscription }) {
  return (
    <section className="rounded-2xl border border-surface-800 p-5">
      <h2 className="text-sm font-semibold text-white">Historial de pagos</h2>
      {sub.payments.length === 0 ? (
        <p className="mt-2 text-xs text-surface-500">Todavía no hay pagos registrados.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="text-surface-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Fecha</th>
                <th className="py-1.5 pr-3 font-medium">Concepto</th>
                <th className="py-1.5 pr-3 font-medium">Período</th>
                <th className="py-1.5 pr-3 font-medium">Medio</th>
                <th className="py-1.5 text-right font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800 text-surface-200">
              {sub.payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3">{fmtDate(p.paidAt) ?? "—"}</td>
                  <td className="py-2 pr-3">{p.kind === "SETUP_FEE" ? "Puesta en marcha" : p.planLabel ?? "Suscripción"}</td>
                  <td className="py-2 pr-3">
                    {p.periodStart && p.periodEnd ? `${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}` : "—"}
                  </td>
                  <td className="py-2 pr-3">{p.providerLabel}</td>
                  <td className="py-2 text-right">{formatUsd(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
