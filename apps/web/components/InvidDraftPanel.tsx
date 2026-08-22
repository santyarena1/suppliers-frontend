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
import NodoSpinner from "@/components/NodoSpinner";
import { CheckCircle2, Loader2, Send, AlertTriangle } from "lucide-react";

export default function InvidDraftPanel({
  items,
  onCreated,
  onPreviewed,
  compact = false,
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
  const reviewedOnce = useRef(false);
  const previewGen = useRef(0);
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
    if (!reviewedOnce.current) publishPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar líneas/cantidades
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
        if (!cancelled) setMetaError(msg || "No se pudieron cargar direcciones / pagos de Invid. ¿Están las credenciales del portal?");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const payload = {
    items: items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    addressId,
    paymentOption,
    deliveryOption,
    expresoId: deliveryOption === "3" ? expresoId || undefined : undefined,
    notes: notes.trim() || undefined,
  };

  function invalidatePreview() {
    setError(null);
    if (reviewedOnce.current && addressId && !(deliveryOption === "3" && !expresoId)) {
      return;
    }
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

  useEffect(() => {
    if (!reviewedOnce.current || !addressId || previewing || submitting) return;
    if (deliveryOption === "3" && !expresoId) return;
    void handlePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, paymentOption, deliveryOption, expresoId, itemsKey]);

  async function handleSubmit() {
    if (!preview?.stockOk) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await invidCheckoutApi.draft(payload);
      setResult(res.data);
      publishPreview(null);
      onCreated(res.data.message);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo crear el borrador en Invid");
    } finally {
      setSubmitting(false);
    }
  }

  const canConfirm = Boolean(preview?.stockOk)
    && !previewing
    && !submitting
    && !(deliveryOption === "3" && !expresoId);

  const selectClass = "bg-surface-900 border border-surface-700 rounded-md px-3 py-2 text-sm text-white";
  const deliveryChoices = deliveries.length ? deliveries : [
    { value: "1", label: "RETIRA" },
    { value: "5", label: "Puerta a puerta" },
    { value: "3", label: "EXPRESO (interior, costo contra entrega)" },
    { value: "6", label: "Entrega Express 24hs (AMBA)" },
  ];

  const addressSelect = (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-sm text-surface-400">Dirección</span>
      <select
        value={addressId}
        onChange={(e) => { setAddressId(e.target.value); invalidatePreview(); }}
        className={selectClass}
      >
        {addresses.length === 0 && <option value="">Sin direcciones en Invid</option>}
        {addresses.map((a) => (
          <option key={a.id} value={a.id}>{a.label} — {a.addressLine}</option>
        ))}
      </select>
    </label>
  );

  const paymentSelect = (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-sm text-surface-400">Forma de pago</span>
      <select
        value={paymentOption}
        onChange={(e) => { setPaymentOption(e.target.value); invalidatePreview(); }}
        className={selectClass}
      >
        {payments.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
    </label>
  );

  const deliverySelect = (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-sm text-surface-400">Forma de entrega</span>
      <select
        value={deliveryOption}
        onChange={(e) => { setDeliveryOption(e.target.value); invalidatePreview(); }}
        className={selectClass}
      >
        {deliveryChoices.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
    </label>
  );

  const expresoSelect = deliveryOption === "3" ? (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-sm text-surface-400">Empresa de expreso</span>
      <select
        value={expresoId}
        onChange={(e) => { setExpresoId(e.target.value); invalidatePreview(); }}
        className={selectClass}
      >
        <option value="">Seleccione el expreso</option>
        {expresoCompanies.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      {expresoCompanies.length === 0 && (
        <span className="text-xs text-surface-500">Revisá en Invid para cargar las empresas.</span>
      )}
    </label>
  ) : null;

  const notesField = (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-sm text-surface-400">Nota para el vendedor (opcional)</span>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={compact ? 1 : 2}
        className={`${selectClass} resize-none`}
        placeholder="Ej. consultar por WhatsApp, pedido de cliente X"
      />
    </label>
  );

  if (loadingMeta) {
    return (
      <div className={`${compact ? "h-9 " : "border border-surface-800 rounded-lg p-5 "}flex items-center gap-2 text-sm text-surface-400`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando checkout de Invid…
      </div>
    );
  }

  if (metaError) {
    return (
      <div className={`${compact ? "" : "border border-red-500/25 bg-red-500/5 rounded-lg p-5 "}text-sm text-red-300`}>
        {metaError}
      </div>
    );
  }

  if (result) {
    return (
      <div className={`${compact ? "" : "border border-emerald-500/25 bg-emerald-500/5 rounded-lg p-4 "}flex flex-col gap-2`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> Borrador creado en Invid
        </div>
        <p className="text-sm text-surface-300 leading-relaxed">{result.message}</p>
        <div className="text-sm text-surface-400 font-mono space-y-0.5">
          {result.webOrderNumber && <p>Pedido web: {result.webOrderNumber}</p>}
          {result.orderNumber && <p>Orden: {result.orderNumber}</p>}
          <p>Total: {formatUSD(result.total)}</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 min-h-9">
          <select
            aria-label="Dirección"
            value={addressId}
            onChange={(e) => { setAddressId(e.target.value); invalidatePreview(); }}
            className="h-9 min-w-[160px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white"
          >
            {addresses.length === 0 && <option value="">Sin direcciones</option>}
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label} — {a.addressLine}</option>
            ))}
          </select>
          <select
            aria-label="Pago"
            value={paymentOption}
            onChange={(e) => { setPaymentOption(e.target.value); invalidatePreview(); }}
            className="h-9 min-w-[140px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white"
          >
            {payments.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <select
            aria-label="Entrega"
            value={deliveryOption}
            onChange={(e) => { setDeliveryOption(e.target.value); invalidatePreview(); }}
            className="h-9 min-w-[140px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white"
          >
            {deliveryChoices.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          {deliveryOption === "3" && (
            <select
              aria-label="Expreso"
              value={expresoId}
              onChange={(e) => { setExpresoId(e.target.value); invalidatePreview(); }}
              className="h-9 min-w-[140px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white"
            >
              <option value="">Expreso</option>
              {expresoCompanies.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          )}
          <button
            onClick={handlePreview}
            disabled={previewing || submitting || !addressId}
            className="h-9 px-3 inline-flex items-center gap-1.5 border border-surface-600 hover:border-brand-500/50 text-surface-100 rounded-md text-sm font-medium disabled:opacity-40 flex-shrink-0"
          >
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {previewing ? "Validando…" : "Revisar"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            title={!preview ? "Primero tenés que revisar en Invid" : !preview.stockOk ? "Invid no validó el stock" : undefined}
            className="h-9 px-3 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-800 disabled:text-surface-500 text-white rounded-md text-sm font-semibold flex-shrink-0"
          >
            {submitting ? <NodoSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            Crear borrador
          </button>
        </div>
        {preview && (
          <InvidValidationFeedback
            compact
            preview={preview}
            deliveryLabel={preview.suggestedDelivery?.label ?? deliveries.find((d) => d.value === deliveryOption)?.label}
          />
        )}
        {error && <p className="text-sm text-red-300 leading-snug whitespace-pre-wrap">{error}</p>}
      </div>
    );
  }

  return (
    <div className="border border-surface-800 rounded-lg p-5 flex flex-col gap-3.5">
      <div>
        <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Pedido Invid</h3>
        <p className="text-sm text-surface-400 mt-1">
          Revisá stock e impuestos en el portal antes de crear el borrador.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {addressSelect}
        {paymentSelect}
        {deliverySelect}
        {expresoSelect}
        {deliveryOption === "6" && (
          <p className="text-sm text-surface-400 sm:col-span-2">
            Express 24hs: al revisar, Invid cotiza el envío con esa dirección.
          </p>
        )}
        <div className="sm:col-span-2">{notesField}</div>
      </div>

      <button
        onClick={handlePreview}
        disabled={previewing || submitting || !addressId}
        className="flex items-center justify-center gap-1.5 border border-surface-600 hover:border-brand-500/50 text-surface-100 rounded-md py-2.5 text-sm font-medium disabled:opacity-40"
      >
        {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        {previewing ? "Validando en Invid…" : "Revisar en Invid"}
      </button>

      {!preview && !error && !previewing && (
        <p className="text-xs text-surface-500">
          Obligatorio: confirma stock, impuestos y envío. Si un producto no está, te lo dice acá.
        </p>
      )}

      {preview && <InvidValidationFeedback preview={preview} deliveryLabel={preview.suggestedDelivery?.label ?? deliveries.find((d) => d.value === deliveryOption)?.label} />}

      {error && (
        <div className="border border-red-500/25 bg-red-500/5 rounded-md px-3 py-2.5 text-sm text-red-300 leading-relaxed whitespace-pre-wrap">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canConfirm}
        title={!preview ? "Primero tenés que revisar en Invid" : !preview.stockOk ? "Invid no validó el stock" : undefined}
        className="flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:bg-surface-800 disabled:text-surface-500 disabled:opacity-100 text-white rounded-md py-2.5 text-sm font-semibold"
      >
        {submitting ? <NodoSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
        Crear borrador
      </button>
    </div>
  );
}

function InvidValidationFeedback({
  preview,
  deliveryLabel,
  compact = false,
}: {
  preview: InvidCheckoutPreview;
  deliveryLabel?: string;
  compact?: boolean;
}) {
  const errors = preview.itemErrors ?? [];
  const ok = preview.stockOk && errors.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className={`rounded-md px-3.5 py-2.5 text-sm leading-relaxed ${
        ok
          ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-300"
          : "bg-red-500/8 border border-red-500/25 text-red-300"
      }`}>
        {ok ? (
          <p className="flex items-start gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {preview.stockMessage || "Se han validado los stocks de los productos"}
          </p>
        ) : (
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium whitespace-pre-wrap">
                {preview.stockMessage || "Invid no validó el stock de este pedido"}
              </p>
              {errors.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
                  {errors.map((e) => (
                    <li key={e.code}>
                      {e.name ? `${e.name} (${e.code})` : e.code}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {ok && !compact && (
        <div className="border border-surface-800 rounded-md p-3.5 text-sm space-y-1">
          <p className="text-surface-400">
            {preview.items.length} producto{preview.items.length === 1 ? "" : "s"} · {preview.paymentLabel}
            {deliveryLabel ? ` · ${deliveryLabel}` : ""}
          </p>
          <div className="border-t border-surface-800 pt-2 mt-2 space-y-1">
            <LedgerRow label="(a) Subtotal" value={formatUSD(preview.subtotal)} />
            <LedgerRow label="(b) Envío" value={formatUSD(preview.shippingCost ?? 0)} />
            <LedgerRow label="(c) IVA" value={formatUSD(preview.iva ?? 0)} />
            <LedgerRow label="(d) Imp. internos" value={formatUSD(preview.impuestos)} />
            <LedgerRow
              label={`(e) Percepciones${preview.percepcionPercent ? ` ${preview.percepcionPercent}%` : ""}`}
              value={formatUSD(preview.percepciones)}
            />
            <p className="flex justify-between text-white font-semibold pt-1">
              <span>Total Invid</span>
              <span className="tabular-nums">{formatUSD(preview.total)}</span>
            </p>
          </div>
        </div>
      )}
      {ok && compact && (
        <p className="text-xs text-surface-500">
          {preview.items.length} producto{preview.items.length === 1 ? "" : "s"} · {preview.paymentLabel}
          {deliveryLabel ? ` · ${deliveryLabel}` : ""}
        </p>
      )}
    </div>
  );
}

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between text-surface-400">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}
