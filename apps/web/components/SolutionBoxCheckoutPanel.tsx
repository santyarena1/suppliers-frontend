"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { solutionBoxCheckoutApi, SolutionBoxCheckoutPreview, SolutionBoxDraftResult } from "@/lib/api";
import { CartItem } from "@/lib/cart";
import { formatUSD } from "@/lib/format";
import {
  CheckoutError,
  CheckoutField,
  CheckoutLoading,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import OrderConfirmModal from "@/components/checkout/OrderConfirmModal";
import { providerOrdersHref } from "@/lib/providerOrders";
import { useBackgroundCheckout } from "@/lib/pendingOrders";
import { useCheckoutWarmup } from "@/lib/checkoutWarmup";

function errMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" · ");
  return msg || fallback;
}

export default function SolutionBoxCheckoutPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (preview: SolutionBoxCheckoutPreview | null) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<SolutionBoxCheckoutPreview | null>(null);
  const [paymentCondition, setPaymentCondition] = useState("");
  const [deliveryType, setDeliveryType] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const seeded = useRef<string | null>(null);
  const hydrated = useRef(false);
  const warm = useCheckoutWarmup("SOLUTION_BOX", cartItems);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<SolutionBoxDraftResult>("SOLUTION_BOX", "No se pudo crear el pedido en Solution Box");

  function publishPreview(data: SolutionBoxCheckoutPreview | null) {
    setPreview(data);
    onPreviewed?.(data);
  }

  useEffect(() => {
    seeded.current = null;
    hydrated.current = false;
    setLoading(true);
  }, [cartKey]);

  useEffect(() => {
    if (warm.itemsKey !== cartKey) return;
    if (warm.status === "ready" && warm.data && seeded.current !== cartKey) {
      seeded.current = cartKey;
      const data = warm.data.preview;
      publishPreview(data);
      setPaymentCondition(data.paymentCondition ?? data.paymentConditions[0]?.value ?? "");
      setDeliveryType(data.deliveryType ?? "1");
      setError(null);
      setLoading(false);
      hydrated.current = true;
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      publishPreview(null);
      setError(warm.error || "No se pudo cotizar el carrito en Solution Box.");
      setLoading(false);
      return;
    }
    if (warm.status === "loading" && seeded.current !== cartKey) {
      setLoading(true);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm, cartKey]);

  function payload() {
    return { items: cartItems, paymentCondition: paymentCondition || undefined, deliveryType: deliveryType || undefined };
  }

  useEffect(() => {
    if (!hydrated.current || !preview || loading) return;
    const same = paymentCondition === (preview.paymentCondition ?? "") && deliveryType === (preview.deliveryType ?? "");
    if (same) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await solutionBoxCheckoutApi.preview(payload());
        if (!cancelled) publishPreview(res.data);
      } catch (err: unknown) {
        if (!cancelled) setError(errMessage(err, "No se pudo actualizar la cotización de Solution Box."));
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCondition, deliveryType]);

  const selectedPay = preview?.paymentConditions.find((p) => p.value === paymentCondition);
  const selectedDelivery = preview?.deliveryTypes.find((d) => d.value === deliveryType);
  const canSubmit = Boolean(preview?.stockOk && paymentCondition && deliveryType && !submitting && !loading);

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await solutionBoxCheckoutApi.draft({ ...payload(), background: true });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en Solution Box"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cotizando en Solution Box…" />;
  if (error && !preview) {
    return (
      <CheckoutError href="/proveedores/SOLUTION_BOX?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
        <CheckoutField label="Pago" htmlFor="sb-pay">
          <CheckoutSelect id="sb-pay" value={paymentCondition} onChange={(e) => setPaymentCondition(e.target.value)}>
            {(preview?.paymentConditions ?? []).map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Entrega" htmlFor="sb-delivery">
          <CheckoutSelect id="sb-delivery" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)}>
            {(preview?.deliveryTypes ?? []).map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutSubmit onClick={() => { setError(null); openConfirm(); }} disabled={!canSubmit}>
          Confirmar Solution Box
        </CheckoutSubmit>
      </div>
      {preview?.deliveryAddress && (
        <p className="text-[11px] text-surface-500">Entrega en {preview.deliveryAddress} (dirección de tu cuenta en Solution Box).</p>
      )}
      {preview && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Neto {formatUSD(preview.subtotal)}
          {preview.vat ? ` · IVA ${formatUSD(preview.vat)}` : ""}
          {preview.perceptionLines.map((line) => ` · ${line.label} ${formatUSD(line.amount)}`).join("")}
          {preview.shippingCost ? ` · Envío ${formatUSD(preview.shippingCost)}` : ""}
          {" · "}Total {formatUSD(preview.total)}
          {preview.totalArs != null && preview.exchange ? ` (ARS ${preview.totalArs.toLocaleString("es-AR", { maximumFractionDigits: 2 })} a $${preview.exchange})` : ""}
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("SOLUTION_BOX")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Solution Box
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="SOLUTION_BOX"
        title="Confirmar pedido"
        warning="Esto crea el pedido real en tu cuenta de Solution Box. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Pago", value: selectedPay?.label ?? "—" },
          { label: "Entrega", value: selectedDelivery?.label ?? "—" },
          { label: "Líneas", value: String(items.length) },
          ...(preview?.perceptionLines ?? []).map((line) => ({ label: line.label, value: formatUSD(line.amount) })),
          ...(preview ? [{ label: "Total", value: formatUSD(preview.total) }] : []),
        ]}
        confirmLabel="Procesar en Solution Box"
        loading={submitting}
        error={error || jobError}
        background={background}
        onBackgroundChange={setBackground}
        result={result ? {
          message: result.message,
          status: result.status,
          refs: [result.orderNumber && `Pedido ${result.orderNumber}`, result.total != null && `Total ${formatUSD(Number(result.total))}`].filter(Boolean) as string[],
        } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={() => finishOrder(onCreated)}
        onLeaveInBackground={leaveInBackground}
      />
    </div>
  );
}
