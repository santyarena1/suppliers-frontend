"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { contactApi } from "@/lib/inbox";
import { getUser } from "@/lib/auth";

/**
 * "Quiero sumar un distribuidor que no está en la lista": le llega al equipo de
 * NODO (bandeja y mail) con el comercio y quién lo pide, para coordinar la
 * integración con ese distribuidor.
 */
export default function RequestIntegrationForm({ initialName = "", onDone }: { initialName?: string; onDone: () => void }) {
  const [name, setName] = useState(initialName);
  const [website, setWebsite] = useState("");
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = getUser()?.email;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      await contactApi.integration({
        providerName: name.trim(),
        website: website.trim() || null,
        hasAccount: hasAccount ?? undefined,
        phone: phone.trim() || null,
        message: message.trim() || null,
      });
      setSent(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 429 ? "Mandaste varios pedidos seguidos. Probá en unos minutos." : "No se pudo mandar el pedido. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        <p className="text-sm font-semibold text-white">Pedido enviado: {name.trim()}</p>
        <p className="max-w-sm text-xs leading-relaxed text-surface-400">
          Lo vemos con el distribuidor y te escribimos{email ? ` a ${email}` : ""} para armar la integración. Mientras tanto, si te mandan la lista de precios, la podés cargar desde «Cargar su lista de precios».
        </p>
        <button type="button" onClick={onDone} className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500">
          Listo
        </button>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-surface-400">
        Decinos con qué distribuidor trabajás y lo sumamos a NODO: hablamos con ellos y conectamos su catálogo, tus precios y los pedidos, igual que con los que ya están.
      </p>
      <label className="flex flex-col gap-1 text-xs text-surface-300">
        Distribuidor
        <input autoFocus required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del distribuidor" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-surface-300">
        Página o portal donde comprás <span className="text-surface-500">(opcional)</span>
        <input maxLength={200} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="distribuidor.com.ar" className={field} />
      </label>
      <fieldset className="flex flex-col gap-1.5 text-xs text-surface-300">
        <legend className="mb-1">¿Ya tenés cuenta con ellos?</legend>
        <div className="flex gap-2">
          {[
            [true, "Sí, ya les compro"],
            [false, "Todavía no"],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setHasAccount(value as boolean)}
              aria-pressed={hasAccount === value}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                hasAccount === value ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-surface-700 text-surface-300 hover:text-white"
              }`}
            >
              {label as string}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-xs text-surface-300">
        WhatsApp para coordinar <span className="text-surface-500">(opcional)</span>
        <input maxLength={40} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 5555-1234" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-surface-300">
        Algo que tengamos que saber <span className="text-surface-500">(opcional)</span>
        <textarea maxLength={1000} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej.: les compro todas las semanas, tienen lista en Excel y portal web" className={`${field} resize-none`} />
      </label>
      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={sending || name.trim().length < 2}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Pedir que lo sumen
      </button>
    </form>
  );
}
