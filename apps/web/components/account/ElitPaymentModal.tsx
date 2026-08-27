"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  CheckoutField,
  CheckoutInput,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import NodoSpinner from "@/components/NodoSpinner";
import { elitAccountApi } from "@/lib/api";
import { elitOpValidations, submitElitPaymentReport } from "@/components/account/elitPayment";

type Bank = { id?: number; name: string };
type Operation = { bank?: number; code?: string; name?: string; validations?: unknown };

export default function ElitPaymentModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent?: () => void;
}) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankId, setBankId] = useState("");
  const [opCode, setOpCode] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [number, setNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void elitAccountApi.paymentOptions()
      .then((res) => {
        if (cancelled) return;
        setBanks(res.data.banks ?? []);
        setOperations(res.data.operations ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(m || "No se pudieron cargar bancos y tipos de Elit");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const opsForBank = operations.filter((o) => !bankId || o.bank == null || String(o.bank) === bankId);
  const selectedBank = banks.find((b) => String(b.id) === bankId);
  const selectedOp = opsForBank.find((o) => o.code === opCode) ?? operations.find((o) => o.code === opCode);
  const need = elitOpValidations(selectedOp?.validations);

  async function send() {
    if (!opCode) {
      setError("Elegí el tipo de operación");
      return;
    }
    if (!bankId) {
      setError("Elegí el banco");
      return;
    }
    if (!date) {
      setError("Completá la fecha");
      return;
    }
    if (!amount) {
      setError("Completá el importe");
      return;
    }
    if (need.number && !number.trim()) {
      setError("Completá el N° de operación");
      return;
    }
    if (!file) {
      setError("Adjuntá el comprobante");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitElitPaymentReport({
        type: selectedOp?.code || opCode,
        bank: selectedBank?.id ?? (bankId ? Number(bankId) : undefined),
        bankName: selectedBank?.name,
        operationName: selectedOp?.name,
        date: date || undefined,
        amount: amount ? Number(amount) : undefined,
        number: number.trim() || undefined,
        file,
      });
      setOk(true);
      onSent?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el informe");
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
        aria-labelledby="elit-payment-title"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-950 border border-surface-800 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="px-5 py-4 border-b border-surface-800 flex items-start justify-between gap-3 sticky top-0 bg-surface-950">
          <h2 id="elit-payment-title" className="text-base font-semibold text-white tracking-tight">
            Informe de pago
          </h2>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="rounded-sm border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[12px] text-amber-100/90 leading-relaxed">
            Elit pide banco, tipo, fecha e importe, y un solo archivo. Enviar crea la operación, adjunta el comprobante y cierra el informe. No se abre un informe vacío.
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><NodoSpinner className="w-6 h-6" /></div>
          ) : ok ? (
            <p className="text-sm text-emerald-400">Informe enviado a Elit.</p>
          ) : (
            <>
              <CheckoutField label="Banco *">
                <CheckoutSelect value={bankId} onChange={(e) => { setBankId(e.target.value); setOpCode(""); }}>
                  <option value="">Elegí banco</option>
                  {banks.map((b) => (
                    <option key={String(b.id ?? b.name)} value={b.id != null ? String(b.id) : ""}>{b.name}</option>
                  ))}
                </CheckoutSelect>
              </CheckoutField>
              <CheckoutField label="Tipo *">
                <CheckoutSelect value={opCode} onChange={(e) => setOpCode(e.target.value)}>
                  <option value="">Elegí operación</option>
                  {opsForBank.map((o) => (
                    <option key={String(o.code)} value={o.code || ""}>{o.name}</option>
                  ))}
                </CheckoutSelect>
              </CheckoutField>
              <CheckoutField label="Fecha *">
                <CheckoutInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </CheckoutField>
              <CheckoutField label="Importe *">
                <CheckoutInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </CheckoutField>
              <CheckoutField label={need.number ? "N° operación *" : "N° operación"}>
                <CheckoutInput value={number} onChange={(e) => setNumber(e.target.value)} />
              </CheckoutField>
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-surface-500">
                  Comprobante *
                </p>
                <input
                  type="file"
                  accept=".pdf,image/*,.jpg,.jpeg,.png"
                  className="text-xs text-surface-300 file:mr-2 file:rounded-sm file:border-0 file:bg-surface-800 file:px-2 file:py-1 file:text-xs file:text-white"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
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
