"use client";

import { useEffect, useMemo, useState } from "react";
import {
  newBytesCheckoutApi,
  NewBytesAddress,
  NewBytesCartSnapshot,
  NewBytesDraftResult,
  NewBytesPaymentOption,
  NewBytesShippingQuote,
} from "@/lib/api";
import { CartItem } from "@/lib/cart";
import { formatARS, formatUSD } from "@/lib/format";
import NodoSpinner from "@/components/NodoSpinner";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  MapPin,
  Package,
  Send,
  Truck,
} from "lucide-react";
import Link from "next/link";

type Delivery = "pickup" | "shipping";

function errMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" · ");
  return msg || fallback;
}

export default function NewBytesDraftPanel({
  items,
  onCreated,
  compact = false,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  compact?: boolean;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // cartKey cubre identidad y cantidad; `items` cambia de referencia en cada render del carrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [addresses, setAddresses] = useState<NewBytesAddress[]>([]);
  const [payments, setPayments] = useState<NewBytesPaymentOption[]>([]);
  const [cart, setCart] = useState<NewBytesCartSnapshot | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const [addrRes, payRes, cartRes] = await Promise.all([
          newBytesCheckoutApi.addresses(),
          newBytesCheckoutApi.payments(),
          newBytesCheckoutApi.cart({ items: cartItems }),
        ]);
        if (cancelled) return;
        const addrs = addrRes.data ?? [];
        const cartSnap = cartRes.data;
        const pays = (cartSnap?.payments?.length ? cartSnap.payments : payRes.data) ?? [];
        setAddresses(addrs);
        setPayments(pays);
        setCart(cartSnap);
        const def = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (def) setAddressId(def.id);
      } catch (err: unknown) {
        if (!cancelled) setMetaError(errMessage(err, "No se pudo armar el carrito en NewBytes. ¿Están user y password del portal?"));
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cartItems]);

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
    (async () => {
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
    })();
    return () => { cancelled = true; };
  }, [delivery, addressId, cartItems]);

  const selectedQuote = quotes.find((q) => q.id === medioDeEnvioId);
  const selectedPayment = filteredPayments.find((p) => p.value === medioDePagoId);
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

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await newBytesCheckoutApi.draft(checkoutPayload());
      setResult(res.data);
      onCreated(res.data.message);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo procesar el carrito en NewBytes"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className={`${compact ? "h-9 " : "bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 "}flex items-center gap-2 text-sm text-surface-400`}>
        <NodoSpinner className="w-3.5 h-3.5" /> Armando el carrito en NewBytes…
      </div>
    );
  }

  if (metaError) {
    return (
      <div className={`${compact ? "" : "bg-red-500/8 border border-red-500/20 rounded-2xl p-4 "}text-sm text-red-300`}>
        {metaError}{" "}
        <Link href="/proveedores/NEW_BYTES?tab=credentials" className="underline text-red-200 hover:text-white">
          Cargar cuenta
        </Link>
      </div>
    );
  }

  if (result) {
    return (
      <div className={`${compact ? "" : "bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 "}flex flex-col gap-2`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> Pedido procesado en NewBytes
        </div>
        <p className="text-sm text-surface-300 leading-relaxed">{result.message}</p>
        <div className="text-sm text-surface-400 font-mono space-y-0.5">
          {result.webOrderNumber && <p>Ref: {result.webOrderNumber}</p>}
          {result.orderNumber && <p>Orden: {result.orderNumber}</p>}
          {result.deliveryLabel && <p>Entrega: {result.deliveryLabel}</p>}
          {result.paymentLabel && <p>Pago: {result.paymentLabel}</p>}
          {result.total != null && <p>Total: {formatUSD(Number(result.total))}</p>}
        </div>
      </div>
    );
  }

  if (compact) {
    const issues = cart?.availability?.issues ?? [];
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 min-h-9">
          <div className="flex h-9 rounded-md border border-surface-700 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => { setDelivery("pickup"); setError(null); }}
              className={`px-3 text-sm ${delivery === "pickup" ? "bg-white text-black font-medium" : "text-surface-300 hover:text-white"}`}
            >
              Retiro
            </button>
            <button
              type="button"
              onClick={() => { setDelivery("shipping"); setError(null); }}
              className={`px-3 text-sm border-l border-surface-700 ${delivery === "shipping" ? "bg-white text-black font-medium" : "text-surface-300 hover:text-white"}`}
            >
              Envío
            </button>
          </div>

          {delivery === "shipping" && (
            <select
              aria-label="Dirección"
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              className="h-9 min-w-[180px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white"
            >
              {addresses.length === 0 && <option value="">Sin direcciones en NB</option>}
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} — {a.addressLine}{a.postalCode ? ` (${a.postalCode})` : ""}
                </option>
              ))}
            </select>
          )}

          {delivery === "shipping" && (
            <select
              aria-label="Medio de envío"
              value={medioDeEnvioId}
              onChange={(e) => setMedioDeEnvioId(e.target.value)}
              disabled={quoting || quotes.length === 0}
              className="h-9 min-w-[180px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white disabled:opacity-50"
            >
              {quoting && <option value="">Cotizando…</option>}
              {!quoting && quotes.length === 0 && <option value="">Sin cotización</option>}
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}{q.total != null ? ` · ${formatARS(q.total)}` : ""}{q.plazo ? ` · ${q.plazo}` : ""}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Pago"
            value={medioDePagoId}
            onChange={(e) => setMedioDePagoId(e.target.value)}
            className="h-9 min-w-[160px] flex-1 bg-surface-900 border border-surface-700 rounded-md px-2.5 text-sm text-white"
          >
            {filteredPayments.length === 0 && <option value="">Sin medios de pago</option>}
            {filteredPayments.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.pickupOnly ? " (retiro)" : ""}{p.interest ? ` · ${p.interest}%` : ""}
              </option>
            ))}
          </select>

          {delivery === "shipping" && (
            <label className="h-9 inline-flex items-center gap-1.5 text-xs text-surface-400 flex-shrink-0">
              <input
                type="checkbox"
                checked={dropShipping}
                onChange={(e) => setDropShipping(e.target.checked)}
              />
              Drop
            </label>
          )}
          {delivery === "shipping" && dropShipping && (
            <>
              <input
                value={dropShippingClientName}
                onChange={(e) => setDropShippingClientName(e.target.value)}
                placeholder="Cliente"
                className="h-9 w-32 bg-surface-900 border border-surface-700 rounded-md px-2 text-sm text-white"
              />
              <input
                value={dropShippingClientEmail}
                onChange={(e) => setDropShippingClientEmail(e.target.value)}
                placeholder="Email"
                className="h-9 w-36 bg-surface-900 border border-surface-700 rounded-md px-2 text-sm text-white"
              />
            </>
          )}

          <button
            onClick={handleSubmit}
            title={!canSubmit
              ? (!medioDePagoId ? "Falta un medio de pago de NewBytes" : quoting ? "Cotizando envío…" : "Completá entrega y pago")
              : undefined}
            disabled={!canSubmit}
            className="h-9 px-3 inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-md text-sm font-semibold flex-shrink-0"
          >
            {submitting ? <NodoSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            {delivery === "pickup" ? "Procesar retiro" : "Procesar envío"}
          </button>
        </div>

        {(issues.length > 0 || error) && (
          <p className={`text-sm ${error ? "text-red-400" : "text-amber-300"}`}>
            {error || issues.map((i) => i.message).join(" · ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 flex flex-col gap-4">
      <div>
        <h3 className="text-xs font-semibold text-sky-300 uppercase tracking-wider">Checkout New Bytes</h3>
        <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
          Esto no es un borrador: arma el carrito en tu cuenta NB, cotiza el envío si corresponde
          y lo procesa. Tarjeta y MercadoPago no se cierran desde Nodo porque redirigen al cobro externo.
        </p>
      </div>

      {cart && (
        <section className="bg-surface-900/70 border border-surface-800 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-surface-300 uppercase tracking-wider">
            <Package className="w-3.5 h-3.5 text-sky-400" /> Carrito en NewBytes
          </div>
          <ul className="text-xs text-surface-300 space-y-1">
            {cart.items.map((it) => (
              <li key={`${it.code}-${it.qty}`} className="flex justify-between gap-2">
                <span className="truncate">{it.qty} × {it.name}</span>
                <span className="tabular-nums text-surface-400">{formatUSD(it.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-xs pt-1 border-t border-surface-800">
            <span className="text-surface-400">Subtotal NB</span>
            <span className="tabular-nums text-white font-semibold">{formatUSD(cart.total ?? cart.subtotal)}</span>
          </div>
          {!cart.stockOk && cart.availability?.issues?.length > 0 && (
            <div className="flex gap-1.5 text-[11px] text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{cart.availability.issues.map((i) => i.message).join(" · ")}</span>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-surface-300 uppercase tracking-wider">
          <Truck className="w-3.5 h-3.5 text-sky-400" /> 1. Entrega
        </div>
        <div className="grid grid-cols-1 gap-2">
          <label className={`flex gap-2 items-start rounded-xl border px-3 py-2.5 cursor-pointer ${delivery === "pickup" ? "border-sky-500/50 bg-sky-500/10" : "border-surface-700 bg-surface-900/40"}`}>
            <input
              type="radio"
              name="nb-delivery"
              checked={delivery === "pickup"}
              onChange={() => { setDelivery("pickup"); setError(null); }}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs text-white font-medium">Retiro en sucursal</span>
              <span className="block text-[11px] text-surface-400 mt-0.5">
                Av. Jujuy 1039, CABA · CP C1229ABF · gratis. Efectivo Caja solo sirve acá.
              </span>
            </span>
          </label>
          <label className={`flex gap-2 items-start rounded-xl border px-3 py-2.5 cursor-pointer ${delivery === "shipping" ? "border-sky-500/50 bg-sky-500/10" : "border-surface-700 bg-surface-900/40"}`}>
            <input
              type="radio"
              name="nb-delivery"
              checked={delivery === "shipping"}
              onChange={() => { setDelivery("shipping"); setError(null); }}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs text-white font-medium">Envío a domicilio</span>
              <span className="block text-[11px] text-surface-400 mt-0.5">
                Cotiza contra una dirección de tu cuenta NB (Andreani, moto, camioneta, etc.).
              </span>
            </span>
          </label>
        </div>

        {delivery === "shipping" && (
          <div className="flex flex-col gap-2 pl-1">
            {addresses.length === 0 ? (
              <p className="text-[11px] text-amber-300">
                No hay direcciones en tu cuenta NewBytes. Cargalas en el portal y volvé a entrar al carrito.
              </p>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-surface-400 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Dirección (idDirCli)
                </span>
                <select
                  value={addressId}
                  onChange={(e) => setAddressId(e.target.value)}
                  className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} — {a.addressLine}{a.postalCode ? ` (${a.postalCode})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {quoting && (
              <p className="text-[11px] text-sky-300 flex items-center gap-1.5">
                <NodoSpinner className="w-3 h-3" /> Cotizando envío para este CP…
              </p>
            )}

            {!quoting && quotes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-surface-400">Medio de envío</span>
                {quotes.map((q) => (
                  <label
                    key={q.id}
                    className={`flex justify-between gap-2 items-start rounded-lg border px-2.5 py-2 cursor-pointer ${medioDeEnvioId === q.id ? "border-sky-500/50 bg-sky-500/10" : "border-surface-700"}`}
                  >
                    <span className="flex gap-2">
                      <input
                        type="radio"
                        name="nb-shipping"
                        checked={medioDeEnvioId === q.id}
                        onChange={() => setMedioDeEnvioId(q.id)}
                      />
                      <span className="text-xs text-white">
                        {q.label}
                        {q.plazo ? <span className="block text-[11px] text-surface-400">{q.plazo}</span> : null}
                      </span>
                    </span>
                    {q.total != null && (
                      <span className="text-xs tabular-nums text-surface-200">{formatARS(q.total)}</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <label className="flex items-start gap-2 text-xs text-surface-300">
              <input
                type="checkbox"
                checked={dropShipping}
                onChange={(e) => setDropShipping(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Dropshipping (marca blanca)
                <span className="block text-[11px] text-surface-500">NewBytes despacha directo a tu cliente.</span>
              </span>
            </label>
            {dropShipping && (
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={dropShippingClientName}
                  onChange={(e) => setDropShippingClientName(e.target.value)}
                  placeholder="Nombre del cliente final (opcional)"
                  className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
                <input
                  value={dropShippingClientEmail}
                  onChange={(e) => setDropShippingClientEmail(e.target.value)}
                  placeholder="Email del cliente final (opcional)"
                  className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-surface-300 uppercase tracking-wider">
          <CreditCard className="w-3.5 h-3.5 text-sky-400" /> 2. Pago
        </div>
        {!delivery ? (
          <p className="text-[11px] text-surface-500">Elegí retiro o envío para ver los medios de pago que aplican.</p>
        ) : (
          <select
            value={medioDePagoId}
            onChange={(e) => setMedioDePagoId(e.target.value)}
            className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
          >
            <option value="">Elegí un medio de pago</option>
            {filteredPayments.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.pickupOnly ? " (solo retiro)" : ""}{p.interest ? ` · interés ${p.interest}%` : ""}
              </option>
            ))}
          </select>
        )}
      </section>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-surface-400">Nota para NewBytes (opcional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white resize-none"
          placeholder="Ej. retirar el viernes / horario de entrega"
        />
      </label>

      {(delivery || selectedPayment) && (
        <div className="bg-surface-900/70 border border-surface-800 rounded-xl p-3 text-xs space-y-1">
          <p className="text-surface-300">
            {delivery === "pickup"
              ? "Retiro en Av. Jujuy 1039, CABA"
              : selectedQuote
                ? `Envío: ${selectedQuote.label}${selectedQuote.plazo ? ` · ${selectedQuote.plazo}` : ""}`
                : "Envío: falta cotizar"}
          </p>
          {selectedPayment && <p className="text-surface-400">Pago: {selectedPayment.label}</p>}
          {selectedQuote?.total != null && (
            <p className="text-surface-400">Costo de envío: {formatARS(selectedQuote.total)}</p>
          )}
          {cart?.total != null && (
            <p className="tabular-nums text-white font-semibold">Total productos NB: {formatUSD(cart.total)}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg py-2.5 text-xs font-semibold"
      >
        {submitting ? <NodoSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
        {delivery === "pickup" ? "Procesar retiro en NewBytes" : "Procesar envío en NewBytes"}
      </button>
    </div>
  );
}
