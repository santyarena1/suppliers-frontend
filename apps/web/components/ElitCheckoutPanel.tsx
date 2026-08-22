"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  elitCheckoutApi,
  ElitCheckoutPreview,
  ElitDraftResult,
} from "@/lib/api";
import { CartItem } from "@/lib/cart";
import Link from "next/link";
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

export default function ElitCheckoutPanel({
  items,
  onCreated,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<ElitCheckoutPreview | null>(null);
  const [warehouse, setWarehouse] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [saleCondition, setSaleCondition] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const seeded = useRef<string | null>(null);
  const warm = useCheckoutWarmup("ELIT", cartItems);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<ElitDraftResult>("ELIT", "No se pudo crear el pedido en Elit");

  useEffect(() => {
    seeded.current = null;
    setLoading(true);
  }, [cartKey]);

  useEffect(() => {
    if (warm.itemsKey !== cartKey) return;
    if (warm.status === "ready" && warm.data && seeded.current !== cartKey) {
      seeded.current = cartKey;
      const data = warm.data.preview;
      setPreview(data);
      setWarehouse(String(data.warehouse ?? data.warehouses[0]?.id ?? ""));
      setShippingMethod(data.shippingMethod ?? "");
      setSaleCondition(data.saleCondition ?? "");
      setShippingAddress(data.shippingAddress ?? data.addresses[0]?.code ?? "");
      setError(null);
      setLoading(false);
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      setError(warm.error || "No se pudo armar el carrito de Elit.");
      setLoading(false);
      return;
    }
    if (warm.status === "loading" && seeded.current !== cartKey) {
      setLoading(true);
      setError(null);
    }
  }, [warm, cartKey]);

  const methods = (preview?.shippingMethods ?? []).filter((m) => String(m.warehouse) === warehouse);
  const selectedPay = preview?.saleConditions.find((p) => p.value === saleCondition);
  const selectedShip = methods.find((m) => m.value === shippingMethod) ?? methods[0];
  const canSubmit = Boolean(warehouse && (selectedShip || shippingMethod) && saleCondition && !submitting && !loading);

  function payload() {
    return {
      items: cartItems,
      warehouse: Number(warehouse),
      shippingMethod: Number(selectedShip?.value || shippingMethod),
      saleCondition: Number(saleCondition),
      shippingAddress: shippingAddress || undefined,
    };
  }

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await elitCheckoutApi.draft({ ...payload(), background: true });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en Elit"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cargando checkout Elit…" />;
  if (error && !preview) {
    return (
      <CheckoutError href="/proveedores/ELIT?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 items-end">
        <CheckoutField label="Depósito" htmlFor="elit-wh">
          <CheckoutSelect id="elit-wh" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            {(preview?.warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Entrega" htmlFor="elit-ship">
          <CheckoutSelect id="elit-ship" value={selectedShip?.value ?? shippingMethod} onChange={(e) => setShippingMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}{m.cost ? ` · USD ${m.cost}` : " · sin cargo"}
              </option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutSubmit onClick={() => { setError(null); openConfirm(); }} disabled={!canSubmit}>
          Confirmar Elit
        </CheckoutSubmit>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckoutField label="Pago" htmlFor="elit-pay">
          <CheckoutSelect id="elit-pay" value={saleCondition} onChange={(e) => setSaleCondition(e.target.value)}>
            {(preview?.saleConditions ?? []).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.surcharge ? ` · +${p.surcharge}%` : ""}
              </option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Dirección" htmlFor="elit-addr">
          <CheckoutSelect id="elit-addr" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)}>
            {(preview?.addresses ?? []).map((a) => (
              <option key={a.code} value={a.code}>{a.addressLine || a.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
      </div>
      {preview && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Neto {formatUSD(preview.subtotal)}
          {preview.vat ? ` · IVA ${formatUSD(preview.vat)}` : ""}
          {preview.perceptions ? ` · Perc. ${formatUSD(preview.perceptions)}` : ""}
          {selectedShip?.cost ? ` · Envío ${formatUSD(selectedShip.cost)}` : ""}
          {" · "}Total {formatUSD(preview.total)}
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("ELIT")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Elit
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="ELIT"
        title="Confirmar pedido"
        warning="Esto crea la nota de venta real en tu cuenta de Elit. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Depósito", value: preview?.warehouses.find((w) => String(w.id) === warehouse)?.name ?? warehouse },
          { label: "Entrega", value: selectedShip?.label ?? "—" },
          { label: "Pago", value: selectedPay?.label ?? "—" },
          { label: "Líneas", value: String(items.length) },
        ]}
        confirmLabel="Procesar en Elit"
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
