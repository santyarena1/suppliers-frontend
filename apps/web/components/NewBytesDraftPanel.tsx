"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  newBytesCheckoutApi,
  NewBytesAddress,
  NewBytesCartSnapshot,
  NewBytesDraftResult,
  NewBytesPaymentOption,
  NewBytesShippingQuote,
} from "@/lib/api";
import { CartItem } from "@/lib/cart";
import Link from "next/link";
import { formatARS, formatUSD } from "@/lib/format";
import {
  CheckoutError,
  CheckoutField,
  CheckoutInput,
  CheckoutLoading,
  CheckoutSegmented,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import OrderConfirmModal from "@/components/checkout/OrderConfirmModal";
import { providerOrdersHref } from "@/lib/providerOrders";
import { trackPendingOrder, usePendingOrders } from "@/lib/pendingOrders";
import { useCheckoutWarmup } from "@/lib/checkoutWarmup";

type Delivery = "pickup" | "shipping";

function errMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" · ");
  return msg || fallback;
}

export default function NewBytesDraftPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (snapshot: NewBytesCartSnapshot | null) => void;
  compact?: boolean;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [addresses, setAddresses] = useState<NewBytesAddress[]>([]);
  const [payments, setPayments] = useState<NewBytesPaymentOption[]>([]);
  const [delivery, setDelivery] = useState<Delivery>("pickup");
  const [addressId, setAddressId] = useState("");
  const [quotes, setQuotes] = useState<NewBytesShippingQuote[]>([]);
  const [medioDeEnvioId, setMedioDeEnvioId] = useState("");
  const [dropShipping, setDropShipping] = useState(false);
  const [dropShippingClientName, setDropShippingClientName] = useState("");
  const [dropShippingClientEmail, setDropShippingClientEmail] = useState("");
  const [medioDePagoId, setMedioDePagoId] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewBytesDraftResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [background, setBackground] = useState(true);
  const submitLock = useRef(false);
  const leftInBackground = useRef(false);
  const seeded = useRef<string | null>(null);
  const jobs = usePendingOrders();
  const warm = useCheckoutWarmup("NEW_BYTES", cartItems);

  useEffect(() => {
    return () => { onPreviewed?.(null); };
  }, [onPreviewed]);

  useEffect(() => {
    seeded.current = null;
    setLoadingMeta(true);
    onPreviewed?.(null);
  }, [cartKey, onPreviewed]);

  useEffect(() => {
    if (warm.itemsKey !== cartKey) return;
    if (warm.status === "ready" && warm.data && seeded.current !== cartKey) {
      seeded.current = cartKey;
      const addrs = warm.data.addresses;
      const pays = warm.data.payments;
      const preview = warm.data.preview;
      setAddresses(addrs);
      setPayments(pays);
      const def = addrs.find((a) => a.isDefault) ?? addrs[0];
      if (def) setAddressId(def.id);
      setMetaError(null);
      setLoadingMeta(false);
      onPreviewed?.({
        items: preview.items,
        payments: pays,
        addresses: addrs,
        pickup: preview.pickup ?? { value: "pickup", label: "Retiro", addressLine: "", postalCode: "" },
        subtotal: preview.subtotal,
        total: preview.total,
        iva: preview.iva,
        perceptions: preview.perceptions,
        perceptionLines: preview.perceptionLines,
        stockOk: preview.stockOk,
        availability: preview.availability,
        subtotales: preview.subtotales,
        note: preview.note,
      });
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      setMetaError(warm.error || "No se pudieron cargar direcciones y pagos de NewBytes.");
      setLoadingMeta(false);
      onPreviewed?.(null);
      return;
    }
    if (warm.status === "loading" && seeded.current !== cartKey) {
      setLoadingMeta(true);
      setMetaError(null);
    }
  }, [warm, cartKey, onPreviewed]);

  const filteredPayments = useMemo(() => {
    if (delivery === "shipping") return payments.filter((p) => !p.pickupOnly);
    return payments;
  }, [payments, delivery]);

  useEffect(() => {
    if (filteredPayments.length === 0) {
      if (medioDePagoId) setMedioDePagoId("");
      return;
    }
    if (!filteredPayments.some((p) => p.value === medioDePagoId)) {
      const preferred = delivery === "pickup"
        ? (filteredPayments.find((p) => p.pickupOnly) ?? filteredPayments[0])
        : filteredPayments[0];
      setMedioDePagoId(preferred.value);
    }
  }, [filteredPayments, medioDePagoId, delivery]);

  useEffect(() => {
    if (delivery !== "shipping") {
      setQuotes([]);
      setMedioDeEnvioId("");
      setQuoting(false);
      return;
    }
    if (!addressId || cartItems.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setQuoting(true);
      setError(null);
      try {
        const res = await newBytesCheckoutApi.shipping({ items: cartItems, addressId });
        if (cancelled) return;
        const next = res.data.quotes ?? [];
        setQuotes(next);
        setMedioDeEnvioId((current) => (next.some((q) => q.id === current) ? current : next[0]?.id ?? ""));
      } catch (err: unknown) {
        if (!cancelled) {
          setQuotes([]);
          setMedioDeEnvioId("");
          setError(errMessage(err, "No se pudo cotizar el envío en NewBytes"));
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [delivery, addressId, cartItems]);

  const selectedQuote = quotes.find((q) => q.id === medioDeEnvioId);
  const canSubmit =
    Boolean(medioDePagoId) &&
    !quoting &&
    !submitting &&
    (delivery === "pickup" || Boolean(addressId && medioDeEnvioId));

  function checkoutPayload() {
    return {
      items: cartItems,
      delivery: delivery as Delivery,
      medioDePagoId: Number(medioDePagoId),
      notes: notes.trim() || undefined,
      background: true,
      ...(delivery === "shipping"
        ? {
            addressId,
            medioDeEnvioId: Number(medioDeEnvioId),
            dropShipping: dropShipping || undefined,
            dropShippingClientName: dropShipping ? dropShippingClientName.trim() || undefined : undefined,
            dropShippingClientEmail: dropShipping ? dropShippingClientEmail.trim() || undefined : undefined,
          }
        : {}),
    };
  }

  function requestConfirm() {
    if (!canSubmit || submitLock.current) return;
    setError(null);
    setResult(null);
    leftInBackground.current = false;
    setConfirmOpen(true);
  }

  useEffect(() => {
    if (!result?.id || result.status !== "PENDING") return;
    const job = jobs.find((j) => j.id === result.id);
    if (!job || job.status === "PENDING") return;
    if (job.status === "CREATED") {
      setResult((prev) => prev ? {
        ...prev,
        status: "CREATED",
        orderNumber: job.orderNumber ?? prev.orderNumber,
        webOrderNumber: job.webOrderNumber ?? prev.webOrderNumber,
        message: job.message,
      } : prev);
    } else {
      setError(job.errorMessage || "No se pudo procesar el carrito en NewBytes");
      setResult(null);
    }
  }, [jobs, result?.id, result?.status]);

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await newBytesCheckoutApi.draft(checkoutPayload());
      trackPendingOrder({
        id: res.data.id,
        provider: "NEW_BYTES",
        status: res.data.status === "CREATED" ? "CREATED" : res.data.status === "FAILED" ? "FAILED" : "PENDING",
        message: res.data.message,
        webOrderNumber: res.data.webOrderNumber,
        orderNumber: res.data.orderNumber,
        startedAt: Date.now(),
      });
      setResult(res.data);
      if (background || leftInBackground.current) setConfirmOpen(false);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo procesar el carrito en NewBytes"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function leaveInBackground() {
    leftInBackground.current = true;
    setConfirmOpen(false);
  }

  function finishOrder() {
    setConfirmOpen(false);
    if (result?.status === "CREATED") onCreated(result.message);
  }

  if (loadingMeta) return <CheckoutLoading label="Cargando checkout NewBytes…" />;

  if (metaError) {
    return (
      <CheckoutError href="/proveedores/NEW_BYTES?tab=credentials" hrefLabel="Cargar cuenta">
        {metaError}
      </CheckoutError>
    );
  }

  const selectedPayment = filteredPayments.find((p) => p.value === medioDePagoId);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] gap-3 items-end">
        <CheckoutField label="Entrega">
          <CheckoutSegmented
            ariaLabel="Entrega NewBytes"
            value={delivery}
            onChange={(next) => { setDelivery(next); setError(null); }}
            options={[
              { value: "pickup", label: "Retiro" },
              { value: "shipping", label: "Envío" },
            ]}
          />
        </CheckoutField>

        <CheckoutField label="Pago" htmlFor="nb-pago">
          <CheckoutSelect
            id="nb-pago"
            value={medioDePagoId}
            onChange={(e) => setMedioDePagoId(e.target.value)}
          >
            {filteredPayments.length === 0 && <option value="">Sin medios de pago</option>}
            {filteredPayments.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.pickupOnly ? " · solo retiro" : ""}{p.interest ? ` · ${p.interest}%` : ""}
              </option>
            ))}
          </CheckoutSelect>
        </CheckoutField>

        <CheckoutSubmit
          onClick={requestConfirm}
          disabled={!canSubmit}
          title={!canSubmit
            ? (!medioDePagoId ? "Falta un medio de pago" : quoting ? "Cotizando envío…" : "Completá entrega y pago")
            : undefined}
        >
          {delivery === "pickup" ? "Confirmar retiro" : "Confirmar envío"}
        </CheckoutSubmit>
      </div>

      {delivery === "pickup" && (
        <p className="text-[11px] text-surface-500">
          Av. Jujuy 1039, CABA · C1229ABF · sin cargo. Efectivo en caja solo aplica acá.
        </p>
      )}

      {delivery === "shipping" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 items-end">
          <CheckoutField label="Dirección" htmlFor="nb-dir">
            <CheckoutSelect id="nb-dir" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
              {addresses.length === 0 && <option value="">Sin direcciones en NB</option>}
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.addressLine}{a.postalCode ? ` (${a.postalCode})` : ""}
                </option>
              ))}
            </CheckoutSelect>
          </CheckoutField>

          <CheckoutField label="Cotización" htmlFor="nb-envio">
            <CheckoutSelect
              id="nb-envio"
              value={medioDeEnvioId}
              onChange={(e) => setMedioDeEnvioId(e.target.value)}
              disabled={quoting || quotes.length === 0}
            >
              {quoting && <option value="">Cotizando…</option>}
              {!quoting && quotes.length === 0 && <option value="">Sin cotización</option>}
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                  {q.total != null ? ` · ${formatARS(q.total)}` : ""}
                  {q.plazo ? ` · ${q.plazo}` : ""}
                </option>
              ))}
            </CheckoutSelect>
          </CheckoutField>

          <label className="h-10 inline-flex items-center gap-2 px-3 border border-surface-700/90 rounded-sm text-sm text-surface-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dropShipping}
              onChange={(e) => setDropShipping(e.target.checked)}
              className="accent-white"
            />
            Drop
          </label>
        </div>
      )}

      {delivery === "shipping" && dropShipping && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CheckoutField label="Cliente final" htmlFor="nb-drop-name">
            <CheckoutInput
              id="nb-drop-name"
              value={dropShippingClientName}
              onChange={(e) => setDropShippingClientName(e.target.value)}
              placeholder="Nombre"
            />
          </CheckoutField>
          <CheckoutField label="Email" htmlFor="nb-drop-email">
            <CheckoutInput
              id="nb-drop-email"
              type="email"
              value={dropShippingClientEmail}
              onChange={(e) => setDropShippingClientEmail(e.target.value)}
              placeholder="uma.s@example.org"
            />
          </CheckoutField>
        </div>
      )}

      <CheckoutField label="Nota (opcional)" htmlFor="nb-nota">
        <CheckoutInput
          id="nb-nota"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Horario, referencia, etc."
        />
      </CheckoutField>

      {selectedQuote?.total != null && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Envío {selectedQuote.label}: {formatARS(selectedQuote.total)}
          {selectedQuote.plazo ? ` · ${selectedQuote.plazo}` : ""}
        </p>
      )}

      {error && !confirmOpen && <CheckoutError>{error}</CheckoutError>}

      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("NEW_BYTES")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de New Bytes
        </Link>
      </p>

      <OrderConfirmModal
        open={confirmOpen}
        provider="NEW_BYTES"
        title="Confirmar pedido"
        warning="Esto crea el pedido real en tu cuenta de New Bytes. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Entrega", value: delivery === "pickup" ? "Retiro · Av. Jujuy 1039" : (selectedQuote?.label ?? "Envío") },
          { label: "Pago", value: selectedPayment?.label ?? "—" },
          ...(selectedQuote?.total != null ? [{ label: "Costo envío", value: formatARS(selectedQuote.total) }] : []),
          { label: "Líneas", value: String(items.length) },
        ]}
        confirmLabel={delivery === "pickup" ? "Procesar retiro" : "Procesar envío"}
        loading={submitting}
        error={error}
        background={background}
        onBackgroundChange={setBackground}
        result={result ? {
          message: result.message,
          status: result.status,
          refs: [
            result.webOrderNumber && `Ref ${result.webOrderNumber}`,
            result.orderNumber && `Orden ${result.orderNumber}`,
            result.total != null && `Total ${formatUSD(Number(result.total))}`,
          ].filter(Boolean) as string[],
        } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={finishOrder}
        onLeaveInBackground={leaveInBackground}
      />
    </div>
  );
}
