"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Boxes, CheckCircle2, Loader2, Repeat, Send, ShoppingCart, TrendingUp, X } from "lucide-react";
import { contactApi } from "@/lib/inbox";
import { getUser } from "@/lib/auth";
import { planPriceLabel } from "@/lib/plans";

/** Lo que se suele conectar entre NODO y un sistema de gestión. */
const NEEDS = ["Stock", "Precios y listas", "Órdenes de compra", "Facturas y cuenta corriente", "Clientes y ventas"] as const;

/** Lo que NODO Custom agrega a Pro, contado para un comercio que ya tiene su sistema. */
const BENEFITS = [
  {
    icon: Boxes,
    title: "Tu sistema y NODO, sincronizados",
    body: "Precios y stock de todos tus distribuidores llegan a tu ERP sin copiar listas a mano. Lo que tenés en tu depósito, NODO lo sabe.",
  },
  {
    icon: ShoppingCart,
    title: "Lo que comprás entra solo",
    body: "Un pedido confirmado en NODO se carga en tu sistema como orden de compra, con el distribuidor, los precios y los impuestos.",
  },
  {
    icon: Repeat,
    title: "Compras automáticas",
    body: "Cuando un producto baja del mínimo, NODO arma el pedido con el distribuidor que tiene mejor precio y stock ese día.",
  },
  {
    icon: Bot,
    title: "Agentes que trabajan por vos",
    body: "Tareas repetitivas —seguir pedidos, avisar cambios de precio, responder consultas internas— a cargo de agentes hechos para tu operación.",
  },
  {
    icon: TrendingUp,
    title: "El mercado, todos los días",
    body: "Cómo se mueven los precios de lo que vendés, con alertas cuando te conviene comprar.",
  },
];

const STEPS = ["Nos contás cómo trabajás", "Relevamos tu operación sin cargo y te armamos la propuesta", "Lo desarrollamos para tu empresa"];

/**
 * "Conectá tu sistema de gestión": explica NODO Custom y manda el pedido al
 * equipo de NODO (bandeja y mail). Va por portal porque se abre desde el
 * sidebar, que tiene transform.
 */
export default function CustomPlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [system, setSystem] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const email = getUser()?.email;
  const toggle = (need: string) => setNeeds((prev) => (prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (system.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      await contactApi.customPlan({ system: system.trim(), needs, phone: phone.trim() || null, message: message.trim() || null });
      setSent(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 429 ? "Mandaste varios pedidos seguidos. Probá en unos minutos." : "No se pudo mandar el pedido. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const field =
    "w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-plan-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-800 bg-gradient-to-br from-brand-600/20 via-surface-950 to-surface-950 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">NODO Custom · {planPriceLabel("CUSTOM")} por mes</p>
            <h2 id="custom-plan-title" className="mt-1 text-lg font-semibold text-white sm:text-xl">
              Conectá tu sistema de gestión con NODO
            </h2>
            <p className="mt-1 max-w-xl text-sm text-surface-400">
              Si trabajás con un ERP o un sistema propio, lo integramos con NODO a la medida de cómo comprás y vendés. Todo lo de Pro, más:
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-surface-400 hover:bg-surface-800 hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1.15fr_1fr]">
          <div className="border-b border-surface-800 px-5 py-4 sm:px-6 md:border-b-0 md:border-r">
            <ul className="space-y-3.5">
              {BENEFITS.map((b) => (
                <li key={b.title} className="flex gap-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600/15 text-brand-300">
                    <b.icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{b.title}</span>
                    <span className="block text-xs leading-relaxed text-surface-400">{b.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <ol className="mt-5 space-y-1.5 border-t border-surface-800 pt-4">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-2.5 text-xs text-surface-300">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-brand-500/40 text-[10px] font-bold text-brand-300">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="px-5 py-4 sm:px-6">
            {sent ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
                <CheckCircle2 className="h-9 w-9 text-emerald-400" />
                <p className="text-sm font-semibold text-white">Recibimos tu pedido</p>
                <p className="max-w-xs text-xs leading-relaxed text-surface-400">
                  Te escribimos{email ? ` a ${email}` : ""} para coordinar el relevamiento. No tiene costo ni compromiso.
                </p>
                <button type="button" onClick={onClose} className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-500">
                  Listo
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-white">Pedí el relevamiento sin cargo</p>
                <label className="flex flex-col gap-1 text-xs text-surface-300">
                  ¿Qué sistema de gestión usás?
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                    placeholder="Tango, Bejerman, Odoo, uno propio…"
                    className={field}
                  />
                </label>
                <fieldset className="flex flex-col gap-1.5 text-xs text-surface-300">
                  <legend className="mb-1">¿Qué querés conectar?</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {NEEDS.map((need) => (
                      <button
                        key={need}
                        type="button"
                        onClick={() => toggle(need)}
                        aria-pressed={needs.includes(need)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          needs.includes(need) ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-surface-700 text-surface-300 hover:text-white"
                        }`}
                      >
                        {need}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="flex flex-col gap-1 text-xs text-surface-300">
                  WhatsApp para coordinar <span className="text-surface-500">(opcional)</span>
                  <input maxLength={40} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 5555-1234" className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-surface-300">
                  Contanos cómo trabajás <span className="text-surface-500">(opcional)</span>
                  <textarea
                    maxLength={1000}
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ej.: 3 locales, compramos a 6 distribuidores y cargamos todo a mano en el sistema"
                    className={`${field} resize-none`}
                  />
                </label>
                {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
                <button
                  type="submit"
                  disabled={sending || system.trim().length < 2}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Quiero conectar mi sistema
                </button>
                <p className="text-center text-[11px] text-surface-500">Sin cargo y sin compromiso. El precio se arma con la propuesta.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
