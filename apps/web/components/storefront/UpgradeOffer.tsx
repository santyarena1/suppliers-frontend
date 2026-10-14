"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Building2, CheckCircle2, Loader2, Sparkles, Tag } from "lucide-react";
import { storefrontApi, type UpgradeKind, type UpgradeRequest } from "@/lib/api";
import { apiError } from "@/lib/storefront";

const OFFERS: { kind: UpgradeKind; icon: typeof Building2; title: string; pitch: string; features: string[] }[] = [
  {
    kind: "DISTRIBUTOR",
    icon: Building2,
    title: "Convertite en Distribuidor",
    pitch: "Para vender en serio a otros comercios, con cartera propia.",
    features: [
      "Cartera de clientes con vendedor asignado",
      "Descuento y condiciones por cliente",
      "Códigos y QR para sumar clientes",
      "Chat con cada comercio",
      "Publicidad dentro de NODO",
    ],
  },
  {
    kind: "BRAND",
    icon: Tag,
    title: "Convertite en Marca",
    pitch: "Si tenés marca propia y querés que la encuentren y la pidan.",
    features: [
      "Tu marca unificada en todo el catálogo",
      "Dónde está tu producto y a qué precio",
      "Lanzamientos, materiales y capacitaciones",
      "Página propia de la marca",
      "Avisos a los comercios que la venden",
    ],
  },
];

/**
 * Siempre a la vista en Vender en NODO: un local que vende no es un distribuidor
 * ni una marca. Si quiere más, lo pide y NODO lo arma.
 */
export default function UpgradeOffer() {
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [open, setOpen] = useState<UpgradeKind | null>(null);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    storefrontApi
      .upgradeRequests()
      .then((r) => setRequests(r.data))
      .catch(() => setRequests([]));
  }, []);

  const pendingOf = (kind: UpgradeKind) => requests.find((r) => r.kind === kind && (r.status === "PENDING" || r.status === "CONTACTED"));

  async function send(kind: UpgradeKind) {
    setSending(true);
    setAviso(null);
    try {
      const res = await storefrontApi.requestUpgrade({ kind, message: message.trim() || null, contact: contact.trim() || null });
      setRequests((prev) => [res.data, ...prev.filter((r) => r.id !== res.data.id)]);
      setOpen(null);
      setMessage("");
      setAviso({ ok: true, text: "Listo, te contactamos para armarlo." });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo enviar la solicitud") });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-600/10 via-surface-900 to-surface-900 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-300" aria-hidden />
        <h2 className="text-sm font-semibold text-white">¿Querés más que una tienda?</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-surface-400">
        Vender en NODO es para publicar tu stock. Si sos distribuidor o tenés marca propia, pedí la cuenta que corresponde
        y te la armamos.
      </p>
      {aviso && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
          {aviso.text}
        </p>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {OFFERS.map((o) => {
          const pending = pendingOf(o.kind);
          return (
            <div key={o.kind} className="flex flex-col rounded-xl border border-surface-800 bg-surface-950/40 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600/15 text-brand-300">
                  <o.icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{o.title}</p>
                  <p className="text-[11px] text-surface-400">{o.pitch}</p>
                </div>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {o.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-surface-300">
                    <BadgeCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-300" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex-1" />
              {pending ? (
                <p className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {pending.status === "CONTACTED" ? "Ya te contactamos: seguimos por ahí." : "Pedido enviado: te vamos a contactar."}
                </p>
              ) : open === o.kind ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={o.kind === "BRAND" ? "¿Qué marca es y qué productos tiene?" : "¿Qué vendés y a cuántos comercios?"}
                    className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    maxLength={200}
                    placeholder="Teléfono o email para contactarte (opcional)"
                    className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void send(o.kind)}
                      disabled={sending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                    >
                      {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Enviar solicitud
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(null)}
                      className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-300 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(o.kind);
                    setAviso(null);
                  }}
                  className="self-start rounded-lg border border-brand-500/40 bg-brand-600/10 px-3 py-2 text-xs font-semibold text-brand-100 hover:bg-brand-600/20"
                >
                  {o.title}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
