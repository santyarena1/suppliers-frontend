"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Ticket, XCircle } from "lucide-react";
import { myApi } from "@/lib/api";

/**
 * Canje de un código de acceso.
 *
 * Es la única forma de conectarse con un distribuidor o una marca que todavía no
 * aparece: te lo dan por fuera de NODO y no dice de quién es hasta que lo canjeás.
 */
export default function RedeemAccessCode({
  onRedeemed,
  purpose = "any",
}: {
  onRedeemed?: () => void;
  purpose?: "any" | "brand";
}) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await myApi.redeemCode(code.trim());
      setResult({ ok: true, msg: `Quedaste conectado con ${res.data.tenantName}` });
      setCode("");
      onRedeemed?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResult({ ok: false, msg: msg || "No se pudo canjear el código" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-3">
      <p className="text-xs text-surface-500">
        {purpose === "brand"
          ? "Si ya trabajás con una marca que no aparece, pediles el código de NODO y canjealo acá. Hasta canjearlo no se revela de quién es."
          : "Si ya trabajás con un distribuidor o una marca que no aparece en la lista, pediles el código de acceso de NODO y canjealo acá."}
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Ticket className="w-4 h-4 text-surface-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={20}
            className="w-full bg-surface-900 border border-surface-700 focus:border-brand-500 rounded-lg pl-9 pr-3 py-2 text-sm text-white tracking-widest outline-none transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={!code.trim() || sending}
          className="flex items-center justify-center gap-1.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-5 py-2 transition-all"
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          Canjear
        </button>
      </form>

      {result && (
        <div className={`flex items-center gap-1.5 text-xs rounded-md px-3 py-2 ${
          result.ok
            ? "bg-emerald-500/8 text-emerald-700 dark:text-emerald-400"
            : "bg-red-500/8 text-red-400"
        }`}>
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {result.msg}
        </div>
      )}
    </div>
  );
}
