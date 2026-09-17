"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { distecnaCheckoutApi, DistecnaCheckoutPreview, DistecnaDraftResult } from "@/lib/api";
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

export default function DistecnaCheckoutPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (preview: DistecnaCheckoutPreview | null) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<DistecnaCheckoutPreview | null>(null);
  const [paymentTermId, setPaymentTermId] = useState("");
  const [deliveryAddressId, setDeliveryAddressId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const seeded = useRef<string | null>(null);
  const warm = useCheckoutWarmup("DISTECNA", cartItems);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<DistecnaDraftResult>("DISTECNA", "No se pudo crear el pedido en Distecna");

  function publishPreview(data: DistecnaCheckoutPreview | null) {
    setPreview(data);
    onPreviewed?.(data);
  }

  useEffect(() => {
    seeded.current = null;
    setLoading(true);
  }, [cartKey]);

  useEffect(() => {
    if (warm.itemsKey !== cartKey) return;
    if (warm.status === "ready" && warm.data && seeded.current !== cartKey) {
      seeded.current = cartKey;
      const data = warm.data.preview;
      publishPreview(data);
      setPaymentTermId(data.paymentTermId ?? data.paymentTerm?.id ?? "");
      setDeliveryAddressId(data.deliveryAddressId ?? data.addresses[0]?.id ?? "");
      setError(null);
      setLoading(false);
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      publishPreview(null);
      setError(warm.error || "No se pudo armar el carrito de Distecna.");
      setLoading(false);
      return;
    }
    if (warm.status === "loading" && seeded.current !== cartKey) {
      setLoading(true);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm, cartKey]);

  const rejected = (preview?.items ?? []).filter((it) => it.error);
  const changes = (preview?.items ?? []).filter((it) => it.priceChanged || it.stockChanged);
  const canSubmit = Boolean(preview?.stockOk && rejected.length === 0 && !submitting && !loading);

  function payload() {
    return {
      items: cartItems,
      paymentTermId: paymentTermId || undefined,
      deliveryAddressId: deliveryAddressId || undefined,
    };
  }

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await distecnaCheckoutApi.draft({ ...payload(), background: true });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en Distecna"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cargando checkout Distecna…" />;
  if (error && !preview) {
    return (
      <CheckoutError href="/proveedores/DISTECNA?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  const selectedAddr = preview?.addresses.find((a) => a.id === deliveryAddressId);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 items-end">
        <CheckoutField label="Condición de pago" htmlFor="dt-pay">
          <CheckoutSelect id="dt-pay" value={paymentTermId} onChange={(e) => setPaymentTermId(e.target.value)}>
            {preview?.paymentTerm ? (
              <option value={preview.paymentTerm.id}>{preview.paymentTerm.name}</option>
            ) : (
              <option value="">Default de la cuenta</option>
            )}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Dirección de entrega" htmlFor="dt-addr">
          <CheckoutSelect id="dt-addr" value={deliveryAddressId} onChange={(e) => setDeliveryAddressId(e.target.value)}>
            <option value="">Sin asignar (default de la cuenta)</option>
            {(preview?.addresses ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutSubmit onClick={() => { setError(null); openConfirm(); }} disabled={!canSubmit}>
          Confirmar Distecna
        </CheckoutSubmit>
      </div>
      {rejected.length > 0 && (
        <CheckoutError>
          Distecna rechazó {rejected.length === 1 ? "un ítem" : `${rejected.length} ítems`}:{" "}
          {rejected.map((it) => `${it.name} (${it.error})`).join(" · ")}. Sacalos del carrito para continuar.
        </CheckoutError>
      )}
      {changes.length > 0 && (
        <p className="text-[11px] text-amber-200/90">
          Precio o stock cambiaron desde la última sync:{" "}
          {changes.map((it) =>
            it.priceChanged
              ? `${it.name} ahora ${formatUSD(it.price ?? 0)}`
              : `${it.name} stock ${it.stock}`
          ).join(" · ")}
          . Se usa el valor actual de Distecna.
        </p>
      )}
      {preview && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Neto {formatUSD(preview.subtotal)}
          {preview.vat ? ` · IVA ${formatUSD(preview.vat)}` : ""}
          {preview.internals ? ` · Internos ${formatUSD(preview.internals)}` : ""}
          {" · "}Total {formatUSD(preview.total)}
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("DISTECNA")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Distecna
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="DISTECNA"
        title="Confirmar pedido"
        warning="Esto crea el pedido real en tu cuenta de Distecna. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Pago", value: preview?.paymentTerm?.name || "Default de la cuenta" },
          { label: "Entrega", value: selectedAddr?.name || "Sin dirección asignada" },
          { label: "Líneas", value: String(items.length) },
          ...(preview ? [{ label: "Total", value: formatUSD(preview.total) }] : []),
        ]}
        confirmLabel="Procesar en Distecna"
        loading={submitting}
        error={error || jobError}
        background={background}
        onBackgroundChange={setBackground}
        result={result ? {
          message: result.message,
          status: result.status,
          refs: [
            result.orderNumber && `Pedido ${result.orderNumber}`,
            result.total != null && `Total ${formatUSD(Number(result.total))}`,
          ].filter(Boolean) as string[],
        } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={() => finishOrder(onCreated)}
        onLeaveInBackground={leaveInBackground}
      />
    </div>
  );
}
