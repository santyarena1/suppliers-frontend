"use client";

import { useEffect, useState } from "react";
import {
  invidCheckoutApi,
  InvidAddress,
  InvidCheckoutPreview,
  InvidDraftResult,
  InvidPaymentOption,
} from "@/lib/api";
import { CartItem } from "@/lib/cart";
import { formatUSD } from "@/lib/format";
import NodoSpinner from "@/components/NodoSpinner";
import { CheckCircle2, Loader2, Send, AlertTriangle } from "lucide-react";

export default function InvidDraftPanel({
  items,
  onCreated,
}: {
  items: CartItem[];
  onCreated: () => void;
}) {
  const [addresses, setAddresses] = useState<InvidAddress[]>([]);
  const [payments, setPayments] = useState<InvidPaymentOption[]>([]);
  const [addressId, setAddressId] = useState("");
  const [paymentOption, setPaymentOption] = useState("67");
  const [notes, setNotes] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<InvidCheckoutPreview | null>(null);
  const [result, setResult] = useState<InvidDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const [addrRes, payRes] = await Promise.all([
          invidCheckoutApi.addresses(),
          invidCheckoutApi.payments(),
        ]);
        if (cancelled) return;
        const addrs = addrRes.data ?? [];
        const pays = payRes.data ?? [];
        setAddresses(addrs);
        setPayments(pays);
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
    notes: notes.trim() || undefined,
  };

  async function handlePreview() {
    setError(null);
    setResult(null);
    setPreviewing(true);
    try {
      const res = await invidCheckoutApi.preview(payload);
      setPreview(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo armar el preview en Invid");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await invidCheckoutApi.draft(payload);
      setResult(res.data);
      onCreated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo crear el borrador en Invid");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-2 text-xs text-orange-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando checkout de Invid…
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 text-xs text-red-300">
        {metaError}
      </div>
    );
  }

  if (result) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
          <CheckCircle2 className="w-4 h-4" /> Borrador creado en Invid
        </div>
        <p className="text-xs text-surface-300 leading-relaxed">{result.message}</p>
        <div className="text-xs text-surface-400 font-mono space-y-0.5">
          {result.webOrderNumber && <p>Pedido web: {result.webOrderNumber}</p>}
          {result.orderNumber && <p>Orden: {result.orderNumber}</p>}
          <p>Total: {formatUSD(result.total)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold text-orange-300 uppercase tracking-wider">Borrador INVID</h3>
        <p className="text-[11px] text-surface-400 mt-1 leading-relaxed">
          Crea un pedido pendiente en Invid. El vendedor de la cuenta te contacta por WhatsApp.
          Si no se informa el pago en 24 h, Invid lo da de baja. La entrega queda como RETIRA; el vendedor la ajusta.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-surface-400">Dirección</span>
        <select
          value={addressId}
          onChange={(e) => { setAddressId(e.target.value); setPreview(null); }}
          className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
        >
          {addresses.length === 0 && <option value="">Sin direcciones en Invid</option>}
          {addresses.map((a) => (
            <option key={a.id} value={a.id}>{a.label} — {a.addressLine}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-surface-400">Forma de pago</span>
        <select
          value={paymentOption}
          onChange={(e) => { setPaymentOption(e.target.value); setPreview(null); }}
          className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white"
        >
          {payments.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-surface-400">Nota para el vendedor (opcional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white resize-none"
          placeholder="Ej. consultar por WhatsApp, pedido de cliente X"
        />
      </label>

      {preview && (
        <div className="bg-surface-900/70 border border-surface-800 rounded-xl p-3 text-xs space-y-1">
          <p className="text-surface-300">{preview.items.length} producto(s) · {preview.paymentLabel}</p>
          <p className="text-surface-400">Entrega: {preview.suggestedDelivery?.label ?? "RETIRA"}</p>
          <p className="tabular-nums text-white font-semibold">Total Invid: {formatUSD(preview.total)}</p>
          {!preview.stockOk && (
            <p className="text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {preview.stockMessage || "Stock no validado"}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={previewing || submitting || !addressId}
          className="flex-1 flex items-center justify-center gap-1.5 border border-surface-700 hover:border-orange-500/40 text-surface-200 rounded-lg py-2 text-xs font-medium disabled:opacity-40"
        >
          {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Revisar en Invid
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || previewing || !addressId || (preview != null && !preview.stockOk)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-lg py-2 text-xs font-semibold"
        >
          {submitting ? <NodoSpinner className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          Crear borrador
        </button>
      </div>
    </div>
  );
}
