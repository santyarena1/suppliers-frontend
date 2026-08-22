"use client";

import { useEffect, useState } from "react";
import {
  newBytesCheckoutApi,
  NewBytesAddress,
  NewBytesCheckoutPreview,
  NewBytesDraftResult,
  NewBytesPaymentOption,
} from "@/lib/api";
import { CartItem } from "@/lib/cart";
import { formatUSD } from "@/lib/format";
import NodoSpinner from "@/components/NodoSpinner";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import Link from "next/link";

export default function NewBytesDraftPanel({
  items,
  onCreated,
}: {
  items: CartItem[];
  onCreated: () => void;
}) {
  const [addresses, setAddresses] = useState<NewBytesAddress[]>([]);
  const [payments, setPayments] = useState<NewBytesPaymentOption[]>([]);
  const [addressId, setAddressId] = useState("");
  const [medioDePagoId, setMedioDePagoId] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<NewBytesCheckoutPreview | null>(null);
  const [result, setResult] = useState<NewBytesDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const [addrRes, payRes] = await Promise.all([
          newBytesCheckoutApi.addresses(),
          newBytesCheckoutApi.payments(),
        ]);
        if (cancelled) return;
        const addrs = addrRes.data ?? [];
        const pays = payRes.data ?? [];
        setAddresses(addrs);
        setPayments(pays);
        const pickup = pays.find((p) => p.pickupOnly) ?? pays[0];
        if (pickup) setMedioDePagoId(pickup.value);
        const def = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (def) setAddressId(def.id);
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (!cancelled) setMetaError(msg || "No se pudieron cargar direcciones / pagos de NewBytes. ¿Están user y password del portal?");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const payload = {
    items: items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    medioDePagoId: Number(medioDePagoId),
    notes: notes.trim() || undefined,
  };

  async function handlePreview() {
    setError(null);
    setResult(null);
    setPreviewing(true);
    try {
      const res = await newBytesCheckoutApi.preview(payload);
      setPreview(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo armar el preview en NewBytes");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await newBytesCheckoutApi.draft(payload);
      setResult(res.data);
      onCreated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo crear el pedido en NewBytes");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 flex items-center gap-2 text-xs text-sky-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando checkout de NewBytes…
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 text-xs text-red-300">
        {metaError}{" "}
        <Link href="/proveedores/NEW_BYTES?tab=credentials" className="underline text-red-200 hover:text-white">
          Cargar cuenta
        </Link>
      </div>
    );
  }

  if (result) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> Pedido creado en NewBytes
        </div>
        <p className="text-xs text-surface-300 leading-relaxed">{result.message}</p>
        <div className="text-xs text-surface-400 font-mono space-y-0.5">
          {result.webOrderNumber && <p>Ref: {result.webOrderNumber}</p>}
          {result.orderNumber && <p>Orden: {result.orderNumber}</p>}
          {result.total != null && <p>Total: {formatUSD(Number(result.total))}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold text-sky-300 uppercase tracking-wider">Pedido NEW BYTES</h3>
        <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
          Crea la orden en tu cuenta de NewBytes como retiro en sucursal (Av. Jujuy 1039, CABA).
          Tarjeta y MercadoPago no se ofrecen desde Nodo porque redirigen a un cobro externo.
        </p>
      </div>

      {addresses.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-surface-400">Dirección (referencia, el retiro usa la sucursal)</span>
          <select
            value={addressId}
            onChange={(e) => { setAddressId(e.target.value); setPreview(null); }}
            className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label} — {a.addressLine}</option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-surface-400">Forma de pago</span>
        <select
          value={medioDePagoId}
          onChange={(e) => { setMedioDePagoId(e.target.value); setPreview(null); }}
          className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
        >
          {payments.map((p) => (
            <option key={p.value} value={p.value}>{p.label}{p.pickupOnly ? " (retiro)" : ""}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-surface-400">Nota para NewBytes (opcional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white resize-none"
          placeholder="Ej. pedido de cliente X, retirar el viernes"
        />
      </label>

      {preview && (
        <div className="bg-surface-900/70 border border-surface-800 rounded-xl p-3 text-xs space-y-1">
          <p className="text-surface-300">{preview.items.length} producto(s) · {preview.paymentLabel}</p>
          <p className="text-surface-400">Entrega: {preview.suggestedDelivery?.label ?? "Retiro en sucursal"}</p>
          {preview.total != null && (
            <p className="tabular-nums text-white font-semibold">Total NewBytes: {formatUSD(preview.total)}</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={previewing || submitting || !medioDePagoId}
          className="flex-1 flex items-center justify-center gap-1.5 border border-surface-700 hover:border-sky-500/40 text-surface-200 rounded-lg py-2 text-xs font-medium disabled:opacity-40"
        >
          {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Revisar en NewBytes
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || previewing || !medioDePagoId}
          className="flex-1 flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg py-2 text-xs font-semibold"
        >
          {submitting ? <NodoSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          Crear pedido
        </button>
      </div>
    </div>
  );
}
