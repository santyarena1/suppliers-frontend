"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  invidCheckoutApi,
  InvidAddress,
  InvidCheckoutPreview,
  InvidDraftResult,
  InvidPaymentOption,
} from "@/lib/api";
import { CartItem, useCart } from "@/lib/cart";
import { applyInvidCheckoutTaxes, grossFromTaxLines } from "@/lib/tax";
import { formatUSD } from "@/lib/format";
import {
  CheckoutError,
  CheckoutField,
  CheckoutGhostButton,
  CheckoutInput,
  CheckoutLoading,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import OrderConfirmModal from "@/components/checkout/OrderConfirmModal";
import { providerOrdersHref } from "@/lib/providerOrders";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export default function InvidDraftPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (preview: InvidCheckoutPreview | null) => void;
  compact?: boolean;
}) {
  const [addresses, setAddresses] = useState<InvidAddress[]>([]);
  const [payments, setPayments] = useState<InvidPaymentOption[]>([]);
  const [deliveries, setDeliveries] = useState<InvidPaymentOption[]>([]);
  const [expresoCompanies, setExpresoCompanies] = useState<InvidPaymentOption[]>([]);
  const [addressId, setAddressId] = useState("");
  const [paymentOption, setPaymentOption] = useState("67");
  const [deliveryOption, setDeliveryOption] = useState("1");
  const [expresoId, setExpresoId] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<InvidCheckoutPreview | null>(null);
  const [result, setResult] = useState<InvidDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reviewedOnce = useRef(false);
  const previewGen = useRef(0);
  const submitLock = useRef(false);
  const { patchItem } = useCart();

  const itemsKey = useMemo(
    () => items.map((it) => `${it.externalId}:${it.qty}`).join("|"),
    [items]
  );

  function applyPreviewToCart(next: InvidCheckoutPreview) {
    if (!next.stockOk) return;
    for (const cartItem of items) {
      const quoted = next.items.find((p) => p.code === cartItem.externalId);
      if (!quoted) continue;
      const taxes = applyInvidCheckoutTaxes(cartItem, cartItem.qty, {
        lineIva: quoted.iva,
        lineInternos: quoted.internos,
        percepcionPercent: next.percepcionPercent,
      });
      patchItem("INVID", cartItem.externalId, {
        taxes,
        finalPrice: grossFromTaxLines(cartItem, taxes),
      });
    }
  }

  function publishPreview(next: InvidCheckoutPreview | null) {
    setPreview(next);
    onPreviewed?.(next);
    if (next) applyPreviewToCart(next);
  }

  useEffect(() => {
    setError(null);
    reviewedOnce.current = false;
    publishPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const [addrRes, payRes, delRes] = await Promise.all([
          invidCheckoutApi.addresses(),
          invidCheckoutApi.payments(),
          invidCheckoutApi.deliveries(),
        ]);
        if (cancelled) return;
        const addrs = addrRes.data ?? [];
        const pays = payRes.data ?? [];
        const dels = delRes.data ?? [];
        setAddresses(addrs);
        setPayments(pays);
        setDeliveries(dels);
        const def = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (def) setAddressId(def.id);
        if (pays[0] && !pays.some((p) => p.value === "67")) setPaymentOption(pays[0].value);
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (!cancelled) setMetaError(msg || "No se pudieron cargar direcciones / pagos de Invid.");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function invalidatePreview() {
    setError(null);
    reviewedOnce.current = false;
    publishPreview(null);
  }

  async function handlePreview() {
    const gen = ++previewGen.current;
    setError(null);
    setResult(null);
    setPreviewing(true);
    try {
      const res = await invidCheckoutApi.preview({
        items: items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
        addressId,
        paymentOption,
        deliveryOption,
        expresoId: deliveryOption === "3" ? expresoId || undefined : undefined,
      });
      if (gen !== previewGen.current) return;
      reviewedOnce.current = true;
      publishPreview(res.data);
      if (res.data.deliveries?.length) setDeliveries(res.data.deliveries);
      if (res.data.expresoCompanies?.length) setExpresoCompanies(res.data.expresoCompanies);
    } catch (err: unknown) {
      if (gen !== previewGen.current) return;
      publishPreview(null);
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo revisar el carrito en Invid");
    } finally {
      if (gen === previewGen.current) setPreviewing(false);
    }
  }

  function requestConfirm() {
    if (submitLock.current || !canConfirm) return;
    if (!preview?.stockOk) {
      setError("Revisá el pedido en Invid antes de crear el borrador");
      return;
    }
    if (!addressId) {
      setError("Elegí una dirección de Invid");
      return;
    }
    if (deliveryOption === "3" && !expresoId) {
      setError("Para EXPRESO tenés que elegir la empresa de transporte");
      return;
    }
    setError(null);
    setResult(null);
    setConfirmOpen(true);
  }

  async function handleSubmit() {
    if (submitLock.current) return;
    if (!preview?.stockOk) {
      setError("Revisá el pedido en Invid antes de crear el borrador");
      setConfirmOpen(false);
      return;
    }
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await invidCheckoutApi.draft({
        items: items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
        addressId,
        paymentOption,
        deliveryOption,
        expresoId: deliveryOption === "3" ? expresoId || undefined : undefined,
        notes: notes.trim() || undefined,
      });
      setResult(res.data);
      publishPreview(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError((Array.isArray(msg) ? msg.join(" · ") : msg) || "No se pudo crear el borrador en Invid");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function finishOrder() {
    setConfirmOpen(false);
    if (result) onCreated(result.message);
  }

  const reviewedOk = Boolean(preview?.stockOk && (preview.itemErrors?.length ?? 0) === 0);
  const canConfirm = reviewedOk
    && Boolean(addressId)
    && !previewing
    && !submitting
    && !(deliveryOption === "3" && !expresoId);

  const deliveryChoices = deliveries.length ? deliveries : [
    { value: "1", label: "RETIRA" },
    { value: "5", label: "Puerta a puerta" },
    { value: "3", label: "EXPRESO (interior, costo contra entrega)" },
    { value: "6", label: "Entrega Express 24hs (AMBA)" },
  ];

  if (loadingMeta) return <CheckoutLoading label="Cargando checkout Invid…" />;

  if (metaError) {
    return (
      <CheckoutError href="/proveedores/INVID?tab=credentials" hrefLabel="Cargar cuenta">
        {metaError}
      </CheckoutError>
    );
  }

  const selectedAddress = addresses.find((a) => a.id === addressId);
  const selectedPayment = payments.find((p) => p.value === paymentOption);
  const selectedDelivery = deliveryChoices.find((d) => d.value === deliveryOption);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
        <CheckoutField label="Dirección" htmlFor="invid-dir">
          <CheckoutSelect
            id="invid-dir"
            value={addressId}
            onChange={(e) => { setAddressId(e.target.value); invalidatePreview(); }}
          >
            {addresses.length === 0 && <option value="">Sin direcciones</option>}
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label} — {a.addressLine}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>

        <CheckoutField label="Pago" htmlFor="invid-pago">
          <CheckoutSelect
            id="invid-pago"
            value={paymentOption}
            onChange={(e) => { setPaymentOption(e.target.value); invalidatePreview(); }}
          >
            {payments.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>

        <CheckoutField label="Entrega" htmlFor="invid-entrega">
          <CheckoutSelect
            id="invid-entrega"
            value={deliveryOption}
            onChange={(e) => { setDeliveryOption(e.target.value); invalidatePreview(); }}
          >
            {deliveryChoices.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>

        <div className="flex gap-2">
          {reviewedOk ? (
            <CheckoutGhostButton
              onClick={handlePreview}
              disabled={previewing || submitting || !addressId}
              loading={previewing}
            >
              {previewing ? "Validando…" : "Revisar de nuevo"}
            </CheckoutGhostButton>
          ) : (
            <CheckoutSubmit
              onClick={handlePreview}
              disabled={previewing || submitting || !addressId || (deliveryOption === "3" && !expresoId)}
              loading={previewing}
              title={!addressId ? "Elegí una dirección" : deliveryOption === "3" && !expresoId ? "Elegí el expreso" : undefined}
            >
              {previewing ? "Validando…" : "Revisar en Invid"}
            </CheckoutSubmit>
          )}
          <CheckoutSubmit
            onClick={requestConfirm}
            disabled={!canConfirm}
            title={
              !addressId ? "Elegí una dirección"
                : deliveryOption === "3" && !expresoId ? "Elegí el expreso"
                : !reviewedOk ? "Revisá el pedido en Invid primero"
                : undefined
            }
            className={reviewedOk ? "" : "opacity-40"}
          >
            Crear borrador
          </CheckoutSubmit>
        </div>
      </div>

      {deliveryOption === "3" && (
        <CheckoutField label="Empresa de expreso" htmlFor="invid-expreso">
          <CheckoutSelect
            id="invid-expreso"
            value={expresoId}
            onChange={(e) => { setExpresoId(e.target.value); invalidatePreview(); }}
          >
            <option value="">Seleccione el expreso</option>
            {expresoCompanies.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
      )}

      <CheckoutField label="Nota (opcional)" htmlFor="invid-nota">
        <CheckoutInput
          id="invid-nota"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Consulta, referencia del cliente…"
        />
      </CheckoutField>

      {!preview && !error && !previewing && (
        <p className="text-xs text-amber-400/90 leading-relaxed">
          Obligatorio: revisá stock, impuestos y envío en Invid. Sin eso no se puede crear el borrador.
        </p>
      )}
      {preview && (
        <InvidValidationFeedback
          preview={preview}
          deliveryLabel={preview.suggestedDelivery?.label ?? deliveries.find((d) => d.value === deliveryOption)?.label}
        />
      )}
      {error && !confirmOpen && <CheckoutError>{error}</CheckoutError>}

      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("INVID")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Invid
        </Link>
      </p>

      <OrderConfirmModal
        open={confirmOpen}
        provider="INVID"
        title="Confirmar borrador"
        warning="Esto crea el borrador en tu cuenta de Invid. Después hay que cerrarlo en el portal del proveedor."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Dirección", value: selectedAddress ? `${selectedAddress.label} — ${selectedAddress.addressLine}` : "—" },
          { label: "Pago", value: selectedPayment?.label ?? paymentOption },
          { label: "Entrega", value: selectedDelivery?.label ?? deliveryOption },
          ...(deliveryOption === "3" ? [{ label: "Expreso", value: expresoCompanies.find((c) => c.value === expresoId)?.label ?? expresoId }] : []),
          ...(preview?.total != null ? [{ label: "Total Invid", value: formatUSD(preview.total) }] : []),
        ]}
        confirmLabel="Crear borrador"
        loading={submitting}
        error={error}
        result={result ? {
          message: result.message,
          refs: [
            result.webOrderNumber && `Pedido web ${result.webOrderNumber}`,
            result.orderNumber && `Orden ${result.orderNumber}`,
            result.total != null && `Total ${formatUSD(result.total)}`,
          ].filter(Boolean) as string[],
        } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={finishOrder}
      />
    </div>
  );
}

function InvidValidationFeedback({
  preview,
  deliveryLabel,
}: {
  preview: InvidCheckoutPreview;
  deliveryLabel?: string;
}) {
  const errors = preview.itemErrors ?? [];
  const ok = preview.stockOk && errors.length === 0;

  return (
    <div className={`flex items-start gap-2 text-sm leading-relaxed ${ok ? "text-emerald-400" : "text-red-400"}`}>
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="font-medium whitespace-pre-wrap">
          {ok
            ? (preview.stockMessage || "Stock validado")
            : (preview.stockMessage || "Invid no validó el stock de este pedido")}
        </p>
        {ok && (
          <p className="text-xs text-surface-500 mt-0.5">
            {preview.items.length} producto{preview.items.length === 1 ? "" : "s"} · {preview.paymentLabel}
            {deliveryLabel ? ` · ${deliveryLabel}` : ""}
          </p>
        )}
        {errors.length > 0 && (
          <ul className="mt-1 space-y-0.5 list-disc pl-4">
            {errors.map((e) => (
              <li key={e.code}>
                {e.name ? `${e.name} (${e.code})` : e.code}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
