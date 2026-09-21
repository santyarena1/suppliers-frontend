"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { polytechCheckoutApi, PolytechCheckoutPreview, PolytechDraftResult } from "@/lib/api";
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

export default function PolytechCheckoutPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (preview: PolytechCheckoutPreview | null) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<PolytechCheckoutPreview | null>(null);
  const [shippingService, setShippingService] = useState<"delivery" | "pickup">("delivery");
  const [addressId, setAddressId] = useState("");
  const [courierId, setCourierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "mercadopago">("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const seeded = useRef<string | null>(null);
  const warm = useCheckoutWarmup("POLYTECH", cartItems);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<PolytechDraftResult>("POLYTECH", "No se pudo crear el pedido en Polytech");

  function publishPreview(data: PolytechCheckoutPreview | null) {
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
      setShippingService(data.shippingService);
      setAddressId(data.addressId ?? data.addresses[0]?.id ?? "");
      setCourierId(data.courierId ?? data.couriers[0]?.id ?? "");
      setPaymentMethod(data.paymentMethod ?? "");
      setError(null);
      setLoading(false);
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      publishPreview(null);
      setError(warm.error || "No se pudo armar el carrito de Polytech.");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm.status, warm.itemsKey, warm.data, warm.error, cartKey]);

  const rejected = preview?.items.filter((it) => it.error) ?? [];
  const changes = preview?.items.filter((it) => it.priceChanged || it.stockChanged) ?? [];
  const canSubmit = Boolean(preview && rejected.length === 0 && !loading && !submitting);

  function payload() {
    return {
      items: cartItems,
      shippingService,
      addressId: shippingService === "delivery" ? addressId : undefined,
      courierId: shippingService === "delivery" ? courierId : undefined,
      paymentMethod: paymentMethod || undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await polytechCheckoutApi.draft({ ...payload(), background: true });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en Polytech"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cargando checkout Polytech…" />;
  if (error && !preview) {
    return (
      <CheckoutError href="/proveedores/POLYTECH?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  const selectedAddr = preview?.addresses.find((a) => a.id === addressId);
  const selectedCourier = preview?.couriers.find((c) => c.id === courierId);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <CheckoutField label="Entrega" htmlFor="pt-ship">
          <CheckoutSelect
            id="pt-ship"
            value={shippingService}
            onChange={(e) => setShippingService(e.target.value === "pickup" ? "pickup" : "delivery")}
          >
            <option value="delivery">Envío</option>
            <option value="pickup">Retiro</option>
          </CheckoutSelect>
        </CheckoutField>
        {shippingService === "delivery" && (
          <>
            <CheckoutField label="Dirección" htmlFor="pt-addr">
              <CheckoutSelect id="pt-addr" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                {(preview?.addresses ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.address}</option>
                ))}
              </CheckoutSelect>
            </CheckoutField>
            <CheckoutField label="Transporte" htmlFor="pt-courier">
              <CheckoutSelect id="pt-courier" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                {(preview?.couriers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </CheckoutSelect>
            </CheckoutField>
          </>
        )}
        <CheckoutField label="Pago" htmlFor="pt-pay">
          <CheckoutSelect
            id="pt-pay"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value === "mercadopago" ? "mercadopago" : "")}
          >
            <option value="">Cuenta corriente</option>
            <option value="mercadopago">Mercado Pago</option>
          </CheckoutSelect>
        </CheckoutField>
      </div>
      <CheckoutField label="Notas" htmlFor="pt-notes">
        <input
          id="pt-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          placeholder="Opcional"
          className="w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100"
        />
      </CheckoutField>
      <div>
        <CheckoutSubmit onClick={() => { setError(null); openConfirm(); }} disabled={!canSubmit}>
          Confirmar Polytech
        </CheckoutSubmit>
      </div>
      {rejected.length > 0 && (
        <CheckoutError>
          Polytech rechazó {rejected.length === 1 ? "un ítem" : `${rejected.length} ítems`}:{" "}
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
          . Se usa el valor actual de Polytech.
        </p>
      )}
      {preview && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Neto {formatUSD(preview.subtotal)}
          {preview.vat ? ` · IVA ${formatUSD(preview.vat)}` : ""}
          {preview.perceptionsAmount ? ` · Percepciones ${formatUSD(preview.perceptionsAmount)}` : ""}
          {" · "}Total {formatUSD(preview.total)} USD
          {preview.exchangeRate ? ` · dólar ${preview.exchangeRate.toLocaleString("es-AR")}` : ""}
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("POLYTECH")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Polytech
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="POLYTECH"
        title="Confirmar pedido"
        warning="Esto crea el pedido real en tu cuenta de Polytech. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Entrega", value: shippingService === "pickup" ? "Retiro" : selectedAddr?.address || "Envío" },
          ...(shippingService === "delivery" && selectedCourier ? [{ label: "Transporte", value: selectedCourier.name }] : []),
          { label: "Pago", value: paymentMethod === "mercadopago" ? "Mercado Pago" : "Cuenta corriente" },
          { label: "Líneas", value: String(items.length) },
          ...(preview ? [{ label: "Total", value: formatUSD(preview.total) }] : []),
        ]}
        confirmLabel="Procesar en Polytech"
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
