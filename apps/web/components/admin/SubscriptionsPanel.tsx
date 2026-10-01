"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { adminSubscriptionsApi } from "@/lib/api";
import {
  ADMIN_SUBSCRIPTION_FILTERS,
  PAYMENT_PROVIDER_LABELS,
  PLAN_CATALOG,
  SETUP_FEE_STATUS_LABELS,
  formatUsd,
  type AdminSubscriptionDetail,
  type AdminSubscriptionFilter,
  type AdminSubscriptionRow,
  type SetupFeeStatus,
  type SubscriptionPaymentProvider,
  type SubscriptionStatus,
  type TenantPlan,
} from "@/lib/plans";
import { CreditCard, Loader2, Search, X } from "lucide-react";

type ShowToast = (msg: string, ok?: boolean) => void;

const STATUS_TONE: Record<SubscriptionStatus, string> = {
  TRIAL: "bg-sky-500/15 text-sky-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-300",
  PAST_DUE: "bg-amber-500/15 text-amber-300",
  GRACE_PERIOD: "bg-orange-500/15 text-orange-300",
  SUSPENDED: "bg-red-500/15 text-red-300",
  COURTESY: "bg-violet-500/15 text-violet-300",
  CANCELLED: "bg-surface-800 text-surface-400",
};

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Alta",
  PLAN_CHANGED: "Cambio de plan",
  PAYMENT_RECORDED: "Pago registrado",
  SETUP_FEE_PAID: "Puesta en marcha pagada",
  SETUP_FEE_UPDATED: "Puesta en marcha actualizada",
  BILLING_DATE_CHANGED: "Fecha de cobro modificada",
  EXTENDED: "Vencimiento extendido",
  COURTESY_SET: "Cortesía otorgada",
  COURTESY_CANCELLED: "Cortesía cancelada",
  COURTESY_CONVERTED: "Cortesía convertida en suscripción",
  SUSPENDED: "Suspendida",
  REACTIVATED: "Reactivada",
  CANCELLED: "Cancelada",
  STATUS_CHANGED: "Cambio de estado",
  PLAN_REQUESTED: "Pedido de cambio de plan",
  UPGRADE_REQUESTED: "Pedido de upgrade",
  PAYMENT_NOTICE: "Aviso de pago del cliente",
};

/** Lo que el cliente o Administración escribió en el evento (Nº de operación, comentario, motivo). */
const EVENT_DATA_LABELS: [string, string][] = [
  ["reference", "Nº de operación"],
  ["message", "Comentario"],
  ["reason", "Motivo"],
  ["note", "Nota"],
];

function eventDetails(data: Record<string, unknown> | null | undefined): [string, string][] {
  if (!data) return [];
  return EVENT_DATA_LABELS.flatMap(([key, label]) => {
    const value = data[key];
    return typeof value === "string" && value.trim() ? [[label, value.trim()] as [string, string]] : [];
  });
}

const REMINDER_LABELS: Record<string, string> = {
  UPCOMING_7D: "7 días antes",
  UPCOMING_3D: "3 días antes",
  DUE_TODAY: "Día del vencimiento",
  OVERDUE_3D: "3 días vencida",
  SUSPENSION_TOMORROW: "Un día antes de suspender",
  SUSPENDED: "Suspensión",
};

const PAYMENT_PROVIDERS: SubscriptionPaymentProvider[] = ["MANUAL", "TRANSFER", "COURTESY", "OTHER"];
const PLANS: TenantPlan[] = ["BASE", "PRO", "CUSTOM"];

function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("es-AR") : "—";
}

function dateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** `YYYY-MM-DD` del input → ISO al mediodía, para no correr de día por huso. */
function toIso(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const inputCls = "bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white";
const btnCls = "text-xs font-medium rounded-md px-3 py-1.5 bg-surface-800 text-surface-200 hover:bg-surface-700 disabled:opacity-50";
const primaryCls = "text-xs font-semibold rounded-md px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50";

function StatusPill({ row }: { row: Pick<AdminSubscriptionRow, "status" | "statusLabel"> }) {
  return <span className={`text-[11px] rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_TONE[row.status]}`}>{row.statusLabel}</span>;
}

export default function SubscriptionsPanel({ showToast }: { showToast: ShowToast }) {
  const [filter, setFilter] = useState<AdminSubscriptionFilter>("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminSubscriptionRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<AdminSubscriptionFilter, number>>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const closeDetail = useCallback(() => setOpenId(null), []);

  const load = useCallback(async () => {
    try {
      const res = await adminSubscriptionsApi.list(filter, query);
      setRows(res.data.rows);
      setCounts(res.data.counts);
    } catch {
      showToast("No se pudieron cargar las suscripciones", false);
    } finally {
      setLoading(false);
    }
  }, [filter, query, showToast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <CreditCard className="w-4 h-4 text-brand-400 mt-0.5" />
        <p className="text-sm text-surface-300">
          Planes y facturación de los comercios. Los pagos se registran a mano; el estado se recalcula solo con las fechas (vencida, en gracia, suspendida). Nada de esto borra datos del comercio.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ADMIN_SUBSCRIPTION_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`text-xs rounded-full px-3 py-1 border ${
              filter === key ? "border-brand-500 bg-brand-500/10 text-brand-300" : "border-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {label}
            {counts[key] !== undefined && <span className="ml-1.5 text-surface-500">{counts[key]}</span>}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 rounded-md border border-surface-700 bg-surface-900 px-2 py-1">
          <Search className="w-3.5 h-3.5 text-surface-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comercio"
            className="bg-transparent text-xs text-white outline-none w-40"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-surface-500 py-10 text-center">No hay suscripciones en este filtro.</p>
      ) : (
        <div className="border border-surface-800 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="text-[11px] text-surface-500 text-left">
              <tr className="border-b border-surface-800">
                <th className="px-3 py-2 font-medium">Comercio</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Precio</th>
                <th className="px-3 py-2 font-medium">Próximo vencimiento</th>
                <th className="px-3 py-2 font-medium">Último pago</th>
                <th className="px-3 py-2 font-medium">Cortesía</th>
                <th className="px-3 py-2 font-medium">Puesta en marcha</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tenantId} className="border-t border-surface-800 first:border-t-0 hover:bg-surface-900/60">
                  <td className="px-3 py-2">
                    <p className="text-white">{row.tenantName}</p>
                    {row.pendingRequest && (
                      <p className="text-[10px] text-amber-300">
                        Pidió {row.pendingRequest.plan ? PLAN_CATALOG[row.pendingRequest.plan].label : "un cambio"}
                      </p>
                    )}
                    {row.paymentNoticeAt && <p className="text-[10px] text-sky-300">Avisó un pago el {fmtDate(row.paymentNoticeAt)}</p>}
                  </td>
                  <td className="px-3 py-2 text-surface-200">{row.planLabel}</td>
                  <td className="px-3 py-2">
                    <StatusPill row={row} />
                  </td>
                  <td className="px-3 py-2 text-surface-200 whitespace-nowrap">
                    {formatUsd(row.price)}
                    {row.priceOverridden && <span className="text-[10px] text-surface-500"> (pactado)</span>}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {fmtDate(row.dueAt)}
                    {row.daysUntilDue !== null && row.daysUntilDue >= 0 && row.daysUntilDue <= 7 && (
                      <span className="text-[10px] text-amber-300"> · en {row.daysUntilDue} d</span>
                    )}
                    {row.daysOverdue !== null && row.daysOverdue > 0 && <span className="text-[10px] text-red-300"> · {row.daysOverdue} d vencida</span>}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {row.lastPayment ? `${formatUsd(row.lastPayment.amount)} · ${fmtDate(row.lastPayment.paidAt)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {row.courtesy.active ? (row.courtesy.until ? `Hasta ${fmtDate(row.courtesy.until)}` : "Sin vencimiento") : "—"}
                  </td>
                  <td className="px-3 py-2 text-surface-300">{row.setupFee.status === "NOT_APPLICABLE" ? "—" : row.setupFee.statusLabel}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setOpenId(row.tenantId)} className="text-xs font-medium text-brand-400 hover:text-brand-300">
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <SubscriptionDetailDialog
          tenantId={openId}
          showToast={showToast}
          onClose={closeDetail}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-surface-800 rounded-xl p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-white">{title}</p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] text-surface-500">
      {label}
      {children}
    </label>
  );
}

function SubscriptionDetailDialog({
  tenantId,
  showToast,
  onClose,
  onChanged,
}: {
  tenantId: string;
  showToast: ShowToast;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminSubscriptionDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const [plan, setPlan] = useState<TenantPlan>("PRO");
  const [price, setPrice] = useState("");
  const [planReason, setPlanReason] = useState("");

  const [payKind, setPayKind] = useState<"SUBSCRIPTION" | "SETUP_FEE">("SUBSCRIPTION");
  const [payMonths, setPayMonths] = useState("1");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payProvider, setPayProvider] = useState<SubscriptionPaymentProvider>("MANUAL");
  const [payRef, setPayRef] = useState("");

  const [billingDate, setBillingDate] = useState("");
  const [extendDays, setExtendDays] = useState("7");

  const [courtesyPlan, setCourtesyPlan] = useState<TenantPlan>("PRO");
  const [courtesyUntil, setCourtesyUntil] = useState("");
  const [courtesyReason, setCourtesyReason] = useState("");

  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const apply = useCallback((d: AdminSubscriptionDetail) => {
    setDetail(d);
    setPlan(d.plan);
    setPrice(d.priceOverridden ? String(d.price) : "");
    setBillingDate(dateInput(d.nextBillingAt ?? d.dueAt));
    setCourtesyPlan(d.plan);
    setCourtesyUntil(dateInput(d.courtesy.until));
    setCourtesyReason(d.courtesy.reason ?? "");
    setNotes(d.notes ?? "");
  }, []);

  useEffect(() => {
    adminSubscriptionsApi
      .detail(tenantId)
      .then((r) => apply(r.data))
      .catch(() => {
        showToast("No se pudo abrir la suscripción", false);
        onClose();
      });
  }, [tenantId, apply, showToast, onClose]);

  async function run(action: () => Promise<{ data: AdminSubscriptionDetail }>, ok: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await action();
      apply(res.data);
      showToast(ok);
      onChanged();
      return true;
    } catch (err) {
      showToast(errMsg(err, "No se pudo guardar el cambio"), false);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const priceValue = price.trim() === "" ? null : Number(price);
  const courtesyActive = detail?.courtesy.active ?? false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-surface-950 border-l border-surface-800 p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-white">{detail?.tenantName ?? "Suscripción"}</p>
            {detail && (
              <p className="text-xs text-surface-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>{detail.planLabel}</span>
                <StatusPill row={detail} />
                <span>{formatUsd(detail.price)} / mes</span>
                {!detail.tenantActive && <span className="text-red-300">Organización desactivada</span>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-surface-400 hover:text-white" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!detail ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              {[
                ["Inicio", fmtDate(detail.startedAt)],
                ["Período actual", `${fmtDate(detail.currentPeriodStart)} – ${fmtDate(detail.currentPeriodEnd)}`],
                ["Vence", fmtDate(detail.dueAt)],
                ["Suspende", fmtDate(detail.suspendsAt)],
                ["Distribuidores conectados", String(detail.usage.connectedProviders)],
                [
                  "Activos en búsqueda",
                  `${detail.usage.activeSearchProviders}${detail.usage.maxSearchProviders !== null ? ` / ${detail.usage.maxSearchProviders}` : ""}`,
                ],
                ["Puesta en marcha", detail.setupFee.status === "NOT_APPLICABLE" ? "No aplica" : detail.setupFee.statusLabel],
                ["Prueba hasta", fmtDate(detail.trialEndsAt)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-surface-900 px-2.5 py-2">
                  <p className="text-surface-500">{label}</p>
                  <p className="text-surface-100">{value}</p>
                </div>
              ))}
            </div>

            {detail.pendingRequest && (
              <p className="text-xs rounded-md px-3 py-2 bg-amber-500/10 text-amber-200">
                El comercio pidió pasar a {detail.pendingRequest.plan ? PLAN_CATALOG[detail.pendingRequest.plan].label : "otro plan"} el{" "}
                {fmtDate(detail.pendingRequest.at)}
                {detail.pendingRequest.message ? `: “${detail.pendingRequest.message}”` : "."}
              </p>
            )}

            <Section title="Plan">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Plan">
                  <select value={plan} onChange={(e) => setPlan(e.target.value as TenantPlan)} className={inputCls}>
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {PLAN_CATALOG[p].label} · {formatUsd(PLAN_CATALOG[p].monthlyPrice)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Precio pactado (vacío = lista)">
                  <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} w-28`} />
                </Field>
                <Field label="Motivo">
                  <input value={planReason} onChange={(e) => setPlanReason(e.target.value)} className={`${inputCls} w-48`} />
                </Field>
                <button
                  type="button"
                  disabled={busy || (plan === detail.plan && priceValue === (detail.priceOverridden ? detail.price : null))}
                  onClick={() =>
                    void run(
                      () => adminSubscriptionsApi.changePlan(tenantId, { plan, price: priceValue, reason: planReason || undefined }),
                      "Plan actualizado"
                    )
                  }
                  className={primaryCls}
                >
                  Guardar plan
                </button>
              </div>
              {plan === "BASE" && detail.plan !== "BASE" && (
                <p className="text-[11px] text-surface-500">
                  Al bajar a Base se conservan todos los distribuidores conectados; quedan activos en búsqueda los 5 más usados y el comercio puede cambiarlos.
                </p>
              )}
              {plan === "CUSTOM" && detail.plan !== "CUSTOM" && (
                <p className="text-[11px] text-surface-500">Pasar a Custom deja la puesta en marcha (USD 300) como pendiente.</p>
              )}
            </Section>

            <Section title="Registrar pago">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Concepto">
                  <select value={payKind} onChange={(e) => setPayKind(e.target.value as "SUBSCRIPTION" | "SETUP_FEE")} className={inputCls}>
                    <option value="SUBSCRIPTION">Suscripción</option>
                    <option value="SETUP_FEE">Puesta en marcha</option>
                  </select>
                </Field>
                {payKind === "SUBSCRIPTION" && (
                  <Field label="Meses">
                    <input type="number" min={1} max={24} value={payMonths} onChange={(e) => setPayMonths(e.target.value)} className={`${inputCls} w-16`} />
                  </Field>
                )}
                <Field label="Monto USD (vacío = automático)">
                  <input type="number" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={`${inputCls} w-28`} />
                </Field>
                <Field label="Fecha">
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Medio">
                  <select value={payProvider} onChange={(e) => setPayProvider(e.target.value as SubscriptionPaymentProvider)} className={inputCls}>
                    {PAYMENT_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {PAYMENT_PROVIDER_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Referencia">
                  <input value={payRef} onChange={(e) => setPayRef(e.target.value)} className={`${inputCls} w-32`} />
                </Field>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        adminSubscriptionsApi.registerPayment(tenantId, {
                          kind: payKind,
                          months: payKind === "SUBSCRIPTION" ? Number(payMonths) || 1 : undefined,
                          amount: payAmount.trim() === "" ? undefined : Number(payAmount),
                          paidAt: payDate ? toIso(payDate) : undefined,
                          provider: payProvider,
                          externalReference: payRef.trim() || undefined,
                        }),
                      "Pago registrado"
                    ).then((done) => {
                      if (!done) return;
                      setPayAmount("");
                      setPayRef("");
                    })
                  }
                  className={primaryCls}
                >
                  Registrar
                </button>
              </div>
              <p className="text-[11px] text-surface-500">El pago extiende el período desde el vencimiento vigente y deja la suscripción activa en el momento.</p>
            </Section>

            <Section title="Vencimiento">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Próximo cobro">
                  <input type="date" value={billingDate} onChange={(e) => setBillingDate(e.target.value)} className={inputCls} />
                </Field>
                <button
                  type="button"
                  disabled={busy || !billingDate}
                  onClick={() => void run(() => adminSubscriptionsApi.setBillingDate(tenantId, toIso(billingDate)), "Fecha de cobro actualizada")}
                  className={btnCls}
                >
                  Cambiar fecha
                </button>
                <Field label="Extender (días)">
                  <input type="number" min={1} max={365} value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className={`${inputCls} w-16`} />
                </Field>
                <button
                  type="button"
                  disabled={busy || !(Number(extendDays) > 0)}
                  onClick={() => void run(() => adminSubscriptionsApi.extend(tenantId, Number(extendDays), reason || undefined), "Vencimiento extendido")}
                  className={btnCls}
                >
                  Extender
                </button>
              </div>
            </Section>

            <Section title="Cortesía">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Plan">
                  <select value={courtesyPlan} onChange={(e) => setCourtesyPlan(e.target.value as TenantPlan)} className={inputCls}>
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {PLAN_CATALOG[p].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Hasta (vacío = sin vencimiento)">
                  <input type="date" value={courtesyUntil} onChange={(e) => setCourtesyUntil(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Motivo">
                  <input value={courtesyReason} onChange={(e) => setCourtesyReason(e.target.value)} className={`${inputCls} w-48`} />
                </Field>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        adminSubscriptionsApi.setCourtesy(tenantId, {
                          plan: courtesyPlan,
                          until: courtesyUntil ? toIso(courtesyUntil) : null,
                          reason: courtesyReason || undefined,
                        }),
                      courtesyActive ? "Cortesía actualizada" : "Cortesía otorgada"
                    )
                  }
                  className={primaryCls}
                >
                  {courtesyActive ? "Actualizar cortesía" : "Dar cortesía"}
                </button>
              </div>
              {courtesyActive && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          adminSubscriptionsApi.endCourtesy(tenantId, {
                            mode: "CONVERT",
                            nextBillingAt: billingDate ? toIso(billingDate) : undefined,
                          }),
                        "Cortesía convertida en suscripción"
                      )
                    }
                    className={btnCls}
                  >
                    Convertir en suscripción paga
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => adminSubscriptionsApi.endCourtesy(tenantId, { mode: "CANCEL" }), "Cortesía cancelada")}
                    className={btnCls}
                  >
                    Cancelar cortesía
                  </button>
                </div>
              )}
              <p className="text-[11px] text-surface-500">
                El comercio ve su plan como activo. Al convertir, el próximo cobro toma la fecha de la sección Vencimiento (o hoy si está vacía).
              </p>
            </Section>

            {detail.plan === "CUSTOM" || detail.setupFee.status !== "NOT_APPLICABLE" ? (
              <Section title="Puesta en marcha">
                <div className="flex flex-wrap items-center gap-2">
                  {(["PENDING", "PAID", "WAIVED"] as SetupFeeStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busy || detail.setupFee.status === status}
                      onClick={() => void run(() => adminSubscriptionsApi.setSetupFee(tenantId, { status }), "Puesta en marcha actualizada")}
                      className={detail.setupFee.status === status ? primaryCls : btnCls}
                    >
                      {SETUP_FEE_STATUS_LABELS[status]}
                    </button>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-surface-300 ml-2">
                    <input
                      type="checkbox"
                      checked={detail.setupFee.blocksCustom}
                      disabled={busy}
                      onChange={(e) =>
                        void run(() => adminSubscriptionsApi.setSetupFee(tenantId, { blocksCustom: e.target.checked }), "Puesta en marcha actualizada")
                      }
                    />
                    Si está pendiente, bloquea las funciones Custom
                  </label>
                </div>
                <p className="text-[11px] text-surface-500">
                  Monto: {detail.setupFee.amount !== null ? formatUsd(detail.setupFee.amount) : "—"}
                  {detail.setupFee.paidAt ? ` · pagada el ${fmtDate(detail.setupFee.paidAt)}` : ""}
                </p>
              </Section>
            ) : null}

            <Section title="Estado">
              <Field label="Motivo (suspensión, cancelación o extensión)">
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {detail.status !== "SUSPENDED" && detail.status !== "CANCELLED" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => adminSubscriptionsApi.suspend(tenantId, reason || undefined), "Suscripción suspendida")}
                    className={btnCls}
                  >
                    Suspender
                  </button>
                )}
                {(detail.status === "SUSPENDED" || detail.status === "CANCELLED" || detail.status === "GRACE_PERIOD" || detail.status === "PAST_DUE") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => adminSubscriptionsApi.reactivate(tenantId, billingDate ? toIso(billingDate) : undefined),
                        "Suscripción reactivada"
                      )
                    }
                    className={primaryCls}
                  >
                    Reactivar
                  </button>
                )}
                {detail.status !== "CANCELLED" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm("¿Cancelar la suscripción? El comercio conserva todos sus datos y se puede reactivar.")) return;
                      void run(() => adminSubscriptionsApi.cancel(tenantId, reason || undefined), "Suscripción cancelada");
                    }}
                    className={`${btnCls} text-red-300`}
                  >
                    Cancelar suscripción
                  </button>
                )}
              </div>
              {detail.suspensionReason && <p className="text-[11px] text-surface-500">Motivo de suspensión: {detail.suspensionReason}</p>}
              {detail.cancellationReason && <p className="text-[11px] text-surface-500">Motivo de cancelación: {detail.cancellationReason}</p>}
            </Section>

            <Section title="Notas internas">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} w-full`} />
              <div>
                <button
                  type="button"
                  disabled={busy || notes === (detail.notes ?? "")}
                  onClick={() => void run(() => adminSubscriptionsApi.setNotes(tenantId, notes.trim() || null), "Notas guardadas")}
                  className={btnCls}
                >
                  Guardar notas
                </button>
              </div>
            </Section>

            <Section title="Pagos">
              {detail.payments.length === 0 ? (
                <p className="text-[11px] text-surface-500">Sin pagos registrados.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-surface-800 text-[11px]">
                  {detail.payments.map((p) => (
                    <li key={p.id} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="text-white">{formatUsd(p.amount)}</span>
                      <span className="text-surface-300">{p.kind === "SETUP_FEE" ? "Puesta en marcha" : p.planLabel ?? "Suscripción"}</span>
                      <span className="text-surface-400">{fmtDate(p.paidAt)}</span>
                      {p.periodStart && (
                        <span className="text-surface-500">
                          {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                        </span>
                      )}
                      <span className="text-surface-500">{p.providerLabel}</span>
                      {p.externalReference && <span className="text-surface-500">Ref. {p.externalReference}</span>}
                      {p.recordedBy && <span className="text-surface-600">por {p.recordedBy}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Historial">
              {detail.events.length === 0 ? (
                <p className="text-[11px] text-surface-500">Sin movimientos.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-surface-800 text-[11px]">
                  {detail.events.map((e) => (
                    <li key={e.id} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="text-surface-400">{new Date(e.createdAt).toLocaleString("es-AR")}</span>
                      <span className="text-white">{EVENT_LABELS[e.type] ?? e.type}</span>
                      {e.fromPlan && e.toPlan && e.fromPlan !== e.toPlan && (
                        <span className="text-surface-300">
                          {PLAN_CATALOG[e.fromPlan].shortLabel} → {PLAN_CATALOG[e.toPlan].shortLabel}
                        </span>
                      )}
                      {e.actor && <span className="text-surface-500">{e.actor}</span>}
                      {eventDetails(e.data).map(([label, value]) => (
                        <span key={label} className="basis-full text-surface-300 whitespace-pre-wrap break-words">
                          <span className="text-surface-500">{label}:</span> {value}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {detail.reminders.length > 0 && (
              <Section title="Recordatorios enviados">
                <ul className="flex flex-col divide-y divide-surface-800 text-[11px]">
                  {detail.reminders.map((r) => (
                    <li key={r.id} className="py-1.5 flex flex-wrap gap-x-3">
                      <span className="text-surface-400">{fmtDate(r.sentAt)}</span>
                      <span className="text-surface-200">{REMINDER_LABELS[r.kind] ?? r.kind}</span>
                      <span className="text-surface-500">{r.channel}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
