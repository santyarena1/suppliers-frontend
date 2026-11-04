"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import {
  CheckoutField,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import {
  type InvidOrder,
  type InvidPaymentForm,
  uploadAuthedFiles,
} from "@/lib/api";

const FALLBACK_FORM: InvidPaymentForm = {
  action: "",
  method: "post",
  fields: {},
  banks: [
    { value: "M", label: "Macro" },
    { value: "G", label: "Galicia" },
  ],
  bankField: "banco",
  notesField: "observaciones",
  fileFields: ["archivo", "archivo2", "archivo3"],
  notice:
    "No envíes el comprobante si necesitás que se realicen cambios en el pedido, primero contactate con nosotros. Usá Observaciones si el pago es parcial, usás saldo a favor o te queda efectivo. Si pagaste por más de un banco, elegí donde depositaste más. Echeq: Galicia. Después de las 17:00 hs rige el TC del día siguiente.",
};

export default function InvidPaymentModal({
  order,
  form,
  onClose,
  onSent,
}: {
  order: InvidOrder;
  form?: InvidPaymentForm | null;
  onClose: () => void;
  onSent?: (sentAt: string) => void;
}) {
  const schema = form ?? FALLBACK_FORM;
  const slots = schema.fileFields.length > 0 ? schema.fileFields.slice(0, 3) : FALLBACK_FORM.fileFields;
  const [bank, setBank] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<(File | null)[]>(() => slots.map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function setFile(i: number, file: File | null) {
    setFiles((prev) => prev.map((f, idx) => (idx === i ? file : f)));
  }

  async function send() {
    const attached = files
      .map((file, i) => (file ? { field: slots[i], file } : null))
      .filter((x): x is { field: string; file: File } => Boolean(x));
    if (!bank) {
      setError("Elegí el banco");
      return;
    }
    if (!notes.trim()) {
      setError("Completá las observaciones");
      return;
    }
    if (attached.length === 0) {
      setError("Adjuntá al menos un comprobante");
      return;
    }
    if (attached.some(({ file }) => !/\.(pdf|jpe?g|png)$/i.test(file.name))) {
      setError("Invid solo acepta archivos PDF, JPG o PNG");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = (await uploadAuthedFiles("/providers/INVID/payments/attach", attached, {
        bank,
        notes: notes.trim(),
        orderNumber: order.orderNumber,
        webOrderNumber: order.webOrderNumber,
        ...(order.paymentOrderId ? { paymentOrderId: order.paymentOrderId } : {}),
        ...(order.paymentHref ? { paymentHref: order.paymentHref } : {}),
      })) as { sentAt?: string };
      setOk(true);
      onSent?.(res.sentAt ?? new Date().toISOString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el comprobante");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invid-payment-title"
        className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-surface-950 border border-surface-800 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="px-5 py-4 border-b border-surface-800 flex items-start justify-between gap-3 sticky top-0 bg-surface-950">
          <div>
            <h2 id="invid-payment-title" className="text-base font-semibold text-white tracking-tight">
              Comprobantes de pago
            </h2>
            <p className="text-[11px] text-surface-500 mt-0.5">
              Pedido {order.orderNumber}
              {order.webOrderNumber ? ` · web ${order.webOrderNumber}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {ok ? (
            <div className="flex flex-col items-start gap-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Comprobante cargado
              </p>
              <p className="text-xs text-surface-400">
                Se envió a Invid para el pedido {order.orderNumber}. Lo vas a ver marcado en Mis pedidos.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3 rounded-sm text-[13px] font-medium border border-surface-700 text-surface-200 hover:text-white hover:border-surface-500"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-sm border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-[12px] text-red-200 leading-relaxed">
                <p className="font-semibold text-red-300 mb-1">Importante</p>
                <p>{schema.notice || FALLBACK_FORM.notice}</p>
              </div>

              <CheckoutField label="Banco *" htmlFor="invid-bank">
                <CheckoutSelect
                  id="invid-bank"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                >
                  <option value="">Elegí el banco</option>
                  {schema.banks.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </CheckoutSelect>
              </CheckoutField>

              <CheckoutField label="Observaciones *" htmlFor="invid-obs">
                <textarea
                  id="invid-obs"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700/90 px-3 py-2 text-sm text-white rounded-sm focus:outline-none focus:border-white/30 placeholder:text-surface-600"
                  placeholder="Pago parcial, saldo a favor, Echeq, etc."
                />
              </CheckoutField>

              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-surface-500">
                  Adjuntar comprobantes de pago *
                </p>
                <div className="flex flex-col gap-2">
                  {slots.map((field, i) => (
                    <input
                      key={field}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="text-xs text-surface-300 file:mr-2 file:rounded-sm file:border-0 file:bg-surface-800 file:px-2 file:py-1 file:text-xs file:text-white"
                      onChange={(e) => setFile(i, e.target.files?.[0] ?? null)}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-red-400/80">Campos obligatorios *</p>
                <CheckoutSubmit type="button" loading={busy} disabled={busy} onClick={() => void send()}>
                  Enviar
                </CheckoutSubmit>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
