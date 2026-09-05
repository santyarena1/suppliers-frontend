"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { newTreeCheckoutApi, NewTreeCheckoutPreview, NewTreeDraftResult } from "@/lib/api";
import { CartItem } from "@/lib/cart";
import { formatUSD } from "@/lib/format";
import {
  CheckoutError,
  CheckoutField,
  CheckoutInput,
  CheckoutLoading,
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

/**
 * Checkout de New Tree: el portal no ofrece opciones de pago ni de entrega
 * (las coordina el vendedor), así que solo se pide una dirección opcional y notas.
 */
export default function NewTreeCheckoutPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (preview: NewTreeCheckoutPreview | null) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<NewTreeCheckoutPreview | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const seeded = useRef<string | null>(null);
  const warm = useCheckoutWarmup("NEW_TREE", cartItems);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<NewTreeDraftResult>("NEW_TREE", "No se pudo crear el pedido en New Tree");

  function publishPreview(data: NewTreeCheckoutPreview | null) {
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
      publishPreview(warm.data.preview);
      setError(null);
      setLoading(false);
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      publishPreview(null);
      setError(warm.error || "No se pudo armar el carrito de New Tree.");
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
  const canSubmit = Boolean(preview?.stockOk && rejected.length === 0 && !submitting && !loading);

  function payload() {
    return {
      items: cartItems,
      deliveryAddress: deliveryAddress.trim() || undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await newTreeCheckoutApi.draft({ ...payload(), background: true });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en New Tree"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cargando checkout New Tree…" />;
  if (error && !preview) {
    return (
      <CheckoutError href="/proveedores/NEW_TREE?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 items-end">
        <CheckoutField label="Dirección de entrega (opcional)" htmlFor="nt-addr">
          <CheckoutInput
            id="nt-addr"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder="Vacío: retiro o entrega según tu cuenta"
            maxLength={300}
          />
        </CheckoutField>
        <CheckoutField label="Notas para Nodo (opcional)" htmlFor="nt-notes">
          <CheckoutInput
            id="nt-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Quedan en el historial de Nodo"
            maxLength={1000}
          />
        </CheckoutField>
        <CheckoutSubmit onClick={() => { setError(null); openConfirm(); }} disabled={!canSubmit}>
          Confirmar New Tree
        </CheckoutSubmit>
      </div>
      {rejected.length > 0 && (
        <CheckoutError>
          New Tree rechazó {rejected.length === 1 ? "un ítem" : `${rejected.length} ítems`}:{" "}
          {rejected.map((it) => `${it.name} (${it.error})`).join(" · ")}. Sacalos del carrito para continuar.
        </CheckoutError>
      )}
      {preview && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Neto {formatUSD(preview.subtotal)}
          {preview.vat ? ` · IVA ${formatUSD(preview.vat)}` : ""}
          {preview.discount ? ` · Descuento ${formatUSD(preview.discount)}` : ""}
          {preview.interest ? ` · Recargo ${formatUSD(preview.interest)}` : ""}
          {" · "}Total {formatUSD(preview.total)}
          {" · "}Pago y entrega los coordina tu vendedor de New Tree.
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("NEW_TREE")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de New Tree
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="NEW_TREE"
        title="Confirmar pedido"
        warning="Esto crea el pedido real en tu cuenta de New Tree. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Entrega", value: deliveryAddress.trim() || "A coordinar con el vendedor" },
          { label: "Pago", value: "A coordinar con el vendedor" },
          { label: "Líneas", value: String(items.length) },
          ...(preview ? [{ label: "Total", value: formatUSD(preview.total) }] : []),
        ]}
        confirmLabel="Procesar en New Tree"
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
