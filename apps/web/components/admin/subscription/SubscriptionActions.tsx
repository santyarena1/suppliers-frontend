"use client";

import { useEffect, useState } from "react";
import { adminSubscriptionsApi } from "@/lib/api";
import {
  PAYMENT_PROVIDER_LABELS,
  PLAN_CATALOG,
  SETUP_FEE_STATUS_LABELS,
  formatUsd,
  type AdminSubscriptionDetail,
  type SetupFeeStatus,
  type SubscriptionPaymentProvider,
  type TenantPlan,
} from "@/lib/plans";
import { Field, PAYMENT_PROVIDERS, PLANS, btnCls, dateInput, fmtDate, inputCls, primaryCls, toIso, today } from "./shared";

type Run = (action: () => Promise<{ data: AdminSubscriptionDetail }>, ok: string) => Promise<boolean>;
type ActionKey = "plan" | "courtesy" | "payment" | "billing" | "status" | "setup";

const ACTION_LABELS: Record<ActionKey, string> = {
  plan: "Cambiar plan",
  courtesy: "Cortesía",
  payment: "Registrar pago",
  billing: "Vencimiento",
  status: "Estado",
  setup: "Puesta en marcha",
};

/** "¿Qué querés hacer?": una sola acción a la vez, con sus campos mínimos. */
export default function SubscriptionActions({
  detail,
  tenantId,
  busy,
  run,
  version,
}: {
  detail: AdminSubscriptionDetail;
  tenantId: string;
  busy: boolean;
  run: Run;
  /** Sube con cada cambio guardado: los formularios se rearman con los datos nuevos. */
  version: number;
}) {
  const hasSetup = detail.plan === "CUSTOM" || detail.setupFee.status !== "NOT_APPLICABLE";
  const actions: ActionKey[] = ["plan", "courtesy", "payment", "billing", "status", ...(hasSetup ? (["setup"] as ActionKey[]) : [])];
  const [action, setAction] = useState<ActionKey>("plan");
  // Un solo "Motivo", el del formulario que está a la vista.
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [action]);
  const why = reason.trim() || undefined;

  const reasonField = (
    <Field label="Motivo (opcional)" grow>
      <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="Queda en el historial" />
    </Field>
  );

  return (
    <section className="border border-surface-800 rounded-xl p-3 flex flex-col gap-3">
      <p className="text-xs font-semibold text-white">¿Qué querés hacer?</p>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {actions.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={action === key}
            onClick={() => setAction(key)}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              action === key ? "border-brand-500 bg-brand-500/15 text-brand-200" : "border-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {ACTION_LABELS[key]}
          </button>
        ))}
      </div>

      {action === "plan" && <PlanForm key={version} detail={detail} tenantId={tenantId} busy={busy} run={run} why={why} reasonField={reasonField} />}
      {action === "courtesy" && <CourtesyForm key={version} detail={detail} tenantId={tenantId} busy={busy} run={run} why={why} reasonField={reasonField} />}
      {action === "payment" && <PaymentForm key={version} tenantId={tenantId} busy={busy} run={run} />}
      {action === "billing" && <BillingForm key={version} detail={detail} tenantId={tenantId} busy={busy} run={run} why={why} reasonField={reasonField} />}
      {action === "status" && <StatusForm key={version} detail={detail} tenantId={tenantId} busy={busy} run={run} why={why} reasonField={reasonField} />}
      {action === "setup" && <SetupFeeForm key={version} detail={detail} tenantId={tenantId} busy={busy} run={run} />}
    </section>
  );
}

type FormProps = {
  detail: AdminSubscriptionDetail;
  tenantId: string;
  busy: boolean;
  run: Run;
  why: string | undefined;
  reasonField: React.ReactNode;
};

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-surface-500">{children}</p>;
}

function PlanForm({ detail, tenantId, busy, run, why, reasonField }: FormProps) {
  const [plan, setPlan] = useState<TenantPlan>(detail.plan);
  const [price, setPrice] = useState(detail.priceOverridden ? String(detail.price) : "");
  const priceValue = price.trim() === "" ? null : Number(price);
  const unchanged = plan === detail.plan && priceValue === (detail.priceOverridden ? detail.price : null);

  return (
    <>
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
        <Field label="Precio pactado USD (vacío = lista)">
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} w-28`} />
        </Field>
        {reasonField}
      </div>
      {plan === "BASE" && detail.plan !== "BASE" && (
        <Hint>Al bajar a Base se conservan todos los distribuidores; quedan en búsqueda los 5 más usados y el comercio puede cambiarlos.</Hint>
      )}
      {plan === "CUSTOM" && detail.plan !== "CUSTOM" && <Hint>Pasar a Custom deja la puesta en marcha (USD 300) como pendiente.</Hint>}
      <div>
        <button
          type="button"
          disabled={busy || unchanged}
          onClick={() => void run(() => adminSubscriptionsApi.changePlan(tenantId, { plan, price: priceValue, reason: why }), "Plan actualizado")}
          className={primaryCls}
        >
          Guardar plan
        </button>
      </div>
    </>
  );
}

function CourtesyForm({ detail, tenantId, busy, run, why, reasonField }: FormProps) {
  const active = detail.courtesy.active;
  const [plan, setPlan] = useState<TenantPlan>(detail.plan);
  const [until, setUntil] = useState(dateInput(detail.courtesy.until));
  const [nextBilling, setNextBilling] = useState(dateInput(detail.nextBillingAt ?? detail.dueAt) || today());

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Plan de cortesía">
          <select value={plan} onChange={(e) => setPlan(e.target.value as TenantPlan)} className={inputCls}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_CATALOG[p].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hasta (vacío = sin vencimiento)">
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inputCls} />
        </Field>
        {reasonField}
      </div>
      <Hint>Sin cobro: el comercio ve su plan como activo{active && detail.courtesy.reason ? ` · Motivo actual: ${detail.courtesy.reason}` : ""}.</Hint>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () => adminSubscriptionsApi.setCourtesy(tenantId, { plan, until: until ? toIso(until) : null, reason: why ?? detail.courtesy.reason ?? undefined }),
              active ? "Cortesía actualizada" : "Cortesía otorgada"
            )
          }
          className={primaryCls}
        >
          {active ? "Actualizar cortesía" : "Dar cortesía"}
        </button>
        {active && (
          <>
            <span className="text-[11px] text-surface-600 px-1">o terminarla:</span>
            <Field label="Primer cobro">
              <input type="date" value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} className={inputCls} />
            </Field>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => adminSubscriptionsApi.endCourtesy(tenantId, { mode: "CONVERT", nextBillingAt: nextBilling ? toIso(nextBilling) : undefined }),
                  "Cortesía convertida en suscripción"
                )
              }
              className={btnCls}
            >
              Pasar a paga
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => adminSubscriptionsApi.endCourtesy(tenantId, { mode: "CANCEL" }), "Cortesía cancelada")}
              className={`${btnCls} text-red-300`}
            >
              Quitar cortesía
            </button>
          </>
        )}
      </div>
    </>
  );
}

function PaymentForm({ tenantId, busy, run }: { tenantId: string; busy: boolean; run: Run }) {
  const [kind, setKind] = useState<"SUBSCRIPTION" | "SETUP_FEE">("SUBSCRIPTION");
  const [months, setMonths] = useState("1");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [provider, setProvider] = useState<SubscriptionPaymentProvider>("TRANSFER");
  const [reference, setReference] = useState("");

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Concepto">
          <select value={kind} onChange={(e) => setKind(e.target.value as "SUBSCRIPTION" | "SETUP_FEE")} className={inputCls}>
            <option value="SUBSCRIPTION">Suscripción</option>
            <option value="SETUP_FEE">Puesta en marcha</option>
          </select>
        </Field>
        {kind === "SUBSCRIPTION" && (
          <Field label="Meses">
            <input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(e.target.value)} className={`${inputCls} w-16`} />
          </Field>
        )}
        <Field label="Monto USD (vacío = automático)">
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} w-28`} />
        </Field>
        <Field label="Fecha">
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Medio">
          <select value={provider} onChange={(e) => setProvider(e.target.value as SubscriptionPaymentProvider)} className={inputCls}>
            {PAYMENT_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PAYMENT_PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nº de operación (opcional)" grow>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Hint>El pago extiende el período desde el vencimiento vigente y deja la suscripción activa en el momento.</Hint>
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                adminSubscriptionsApi.registerPayment(tenantId, {
                  kind,
                  months: kind === "SUBSCRIPTION" ? Number(months) || 1 : undefined,
                  amount: amount.trim() === "" ? undefined : Number(amount),
                  paidAt: paidAt ? toIso(paidAt) : undefined,
                  provider,
                  externalReference: reference.trim() || undefined,
                }),
              "Pago registrado"
            ).then((done) => {
              if (!done) return;
              setAmount("");
              setReference("");
            })
          }
          className={primaryCls}
        >
          Registrar pago
        </button>
      </div>
    </>
  );
}

function BillingForm({ detail, tenantId, busy, run, why, reasonField }: FormProps) {
  const [date, setDate] = useState(dateInput(detail.nextBillingAt ?? detail.dueAt));
  const [days, setDays] = useState("7");

  return (
    <>
      <Hint>
        Hoy vence el {fmtDate(detail.dueAt)}
        {detail.suspendsAt ? ` y se suspende el ${fmtDate(detail.suspendsAt)}` : ""}. Cambiá la fecha del próximo cobro o sumale días.
      </Hint>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Próximo cobro">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <button
          type="button"
          disabled={busy || !date}
          onClick={() => void run(() => adminSubscriptionsApi.setBillingDate(tenantId, toIso(date)), "Fecha de cobro actualizada")}
          className={primaryCls}
        >
          Cambiar fecha
        </button>
        <span className="text-[11px] text-surface-600 px-1">o</span>
        <Field label="Sumar días">
          <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} className={`${inputCls} w-16`} />
        </Field>
        <button
          type="button"
          disabled={busy || !(Number(days) > 0)}
          onClick={() => void run(() => adminSubscriptionsApi.extend(tenantId, Number(days), why), "Vencimiento extendido")}
          className={btnCls}
        >
          Extender
        </button>
      </div>
      <div className="flex">{reasonField}</div>
    </>
  );
}

function StatusForm({ detail, tenantId, busy, run, why, reasonField }: FormProps) {
  const [nextBilling, setNextBilling] = useState(dateInput(detail.nextBillingAt ?? detail.dueAt));
  const canSuspend = detail.status !== "SUSPENDED" && detail.status !== "CANCELLED";
  const canReactivate = ["SUSPENDED", "CANCELLED", "GRACE_PERIOD", "PAST_DUE"].includes(detail.status);
  const canCancel = detail.status !== "CANCELLED";

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        {reasonField}
        {canReactivate && (
          <Field label="Próximo cobro al reactivar (opcional)">
            <input type="date" value={nextBilling} onChange={(e) => setNextBilling(e.target.value)} className={inputCls} />
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {canReactivate && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => adminSubscriptionsApi.reactivate(tenantId, nextBilling ? toIso(nextBilling) : undefined), "Suscripción reactivada")}
            className={primaryCls}
          >
            Reactivar
          </button>
        )}
        {canSuspend && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => adminSubscriptionsApi.suspend(tenantId, why), "Suscripción suspendida")}
            className={btnCls}
          >
            Suspender
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("¿Cancelar la suscripción? El comercio conserva todos sus datos y se puede reactivar.")) return;
              void run(() => adminSubscriptionsApi.cancel(tenantId, why), "Suscripción cancelada");
            }}
            className={`${btnCls} text-red-300`}
          >
            Cancelar suscripción
          </button>
        )}
      </div>
      <Hint>Nada de esto borra datos del comercio.</Hint>
      {detail.suspensionReason && <Hint>Motivo de suspensión: {detail.suspensionReason}</Hint>}
      {detail.cancellationReason && <Hint>Motivo de cancelación: {detail.cancellationReason}</Hint>}
    </>
  );
}

function SetupFeeForm({ detail, tenantId, busy, run }: { detail: AdminSubscriptionDetail; tenantId: string; busy: boolean; run: Run }) {
  return (
    <>
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
      </div>
      <label className="flex items-center gap-1.5 text-xs text-surface-300">
        <input
          type="checkbox"
          checked={detail.setupFee.blocksCustom}
          disabled={busy}
          onChange={(e) => void run(() => adminSubscriptionsApi.setSetupFee(tenantId, { blocksCustom: e.target.checked }), "Puesta en marcha actualizada")}
        />
        Si está pendiente, bloquea las funciones Custom
      </label>
      <Hint>
        Monto: {detail.setupFee.amount !== null ? formatUsd(detail.setupFee.amount) : "—"}
        {detail.setupFee.paidAt ? ` · pagada el ${fmtDate(detail.setupFee.paidAt)}` : ""}. Para cobrarla, usá «Registrar pago» → Puesta en marcha.
      </Hint>
    </>
  );
}
