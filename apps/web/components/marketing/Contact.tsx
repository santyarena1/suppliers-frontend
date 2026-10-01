"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, MessageCircle } from "lucide-react";
import TurnstileWidget from "@/components/TurnstileWidget";
import { apiFailure } from "@/lib/api";
import { contactApi } from "@/lib/inbox";
import { CONTACT_KIND_EVENT, NODO_WHATSAPP_LABEL, whatsappUrl, type LandingContactKind } from "@/lib/contact";
import { Reveal } from "./Reveal";

const KINDS: { kind: LandingContactKind; label: string; placeholder: string }[] = [
  { kind: "CONTACT", label: "Consulta", placeholder: "Contanos qué querés saber de NODO." },
  { kind: "CUSTOM", label: "NODO Custom", placeholder: "¿Cuántos locales tenés y con qué sistema trabajás (ERP, CRM)?" },
  { kind: "SUPPLIER", label: "Soy distribuidor", placeholder: "Qué vendés, a cuántos comercios y desde dónde." },
  { kind: "BRAND", label: "Soy marca", placeholder: "Qué marca representás y con qué distribuidores trabajás." },
];

const WHATSAPP_TEXT: Record<LandingContactKind, string> = {
  CONTACT: "Hola, tengo una consulta sobre NODO.",
  CUSTOM: "Hola, quiero consultar por NODO Custom.",
  SUPPLIER: "Hola, soy distribuidor y quiero sumarme a NODO.",
  BRAND: "Hola, represento una marca y quiero sumarme a NODO.",
};

/**
 * Contacto de la landing: el formulario carga una solicitud en NODO (llega por
 * mail y a la bandeja de Administración) y WhatsApp queda al lado para quien
 * prefiere escribir directo. Los CTA de Custom, distribuidores y marcas
 * eligen el tipo de consulta antes de bajar hasta acá.
 */
export function Contact({ defaultKind = "CONTACT", title }: { defaultKind?: LandingContactKind; title?: string }) {
  const [kind, setKind] = useState<LandingContactKind>(defaultKind);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKind = (e: Event) => {
      const next = (e as CustomEvent<LandingContactKind>).detail;
      if (KINDS.some((k) => k.kind === next)) {
        setKind(next);
        setSent(false);
      }
    };
    window.addEventListener(CONTACT_KIND_EVENT, onKind);
    return () => window.removeEventListener(CONTACT_KIND_EVENT, onKind);
  }, []);

  const current = KINDS.find((k) => k.kind === kind) ?? KINDS[0];
  const needsCompany = kind !== "CONTACT";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) {
      setError("Escribí un mensaje un poco más largo.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await contactApi.send({
        kind,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        message: message.trim(),
      });
      setSent(true);
      setMessage("");
    } catch (err) {
      const failure = apiFailure(err);
      setError(
        failure.status === 429
          ? "Mandaste varias consultas seguidas. Esperá unos minutos o escribinos por WhatsApp."
          : failure.message || "No se pudo enviar. Probá de nuevo o escribinos por WhatsApp."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="contacto" className="nl-section nl-divider relative scroll-mt-16 overflow-hidden">
      <div className="nl-glow" style={{ width: 600, height: 420, right: -240, top: -200 }} aria-hidden />
      <div className="nl-shell relative grid items-start gap-12 lg:grid-cols-[0.9fr_1fr] lg:gap-20">
        <Reveal>
          <p className="nl-kicker">Contacto</p>
          <h2 className="nl-h2 mt-3">{title ?? "Hablemos"}</h2>
          <p className="nl-lead mt-5 max-w-[46ch]">
            ¿Querés NODO Custom, sos distribuidor o marca, o tenés una duda antes de probar? Escribinos y te respondemos
            en menos de 24 horas hábiles.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <a href={whatsappUrl(WHATSAPP_TEXT[kind])} target="_blank" rel="noopener noreferrer" className="lnd-wa">
              <MessageCircle className="h-4 w-4" aria-hidden /> Escribinos por WhatsApp
            </a>
            <span className="text-sm tabular-nums text-[var(--fg-3)]">{NODO_WHATSAPP_LABEL}</span>
          </div>
        </Reveal>

        <Reveal delay={100}>
          {sent ? (
            <div className="nl-surface lnd-done p-6 sm:p-8" role="status">
              <span className="lnd-done__icon"><Check className="h-5 w-5" aria-hidden /></span>
              <h3 className="text-xl font-semibold text-white">Recibimos tu mensaje</h3>
              <p className="text-[0.95rem] text-[var(--fg-2)]">
                Te contactamos a {email.trim() || "tu mail"} en menos de 24 horas hábiles. Si es urgente, escribinos por
                WhatsApp.
              </p>
              <button type="button" onClick={() => setSent(false)} className="nl-btn nl-btn--ghost">
                Mandar otra consulta
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="nl-surface p-6 sm:p-8">
              {error && (
                <div role="alert" className="mb-6 flex items-start gap-2.5 rounded-[10px] bg-[rgb(240_106_106/0.1)] px-3.5 py-3 text-sm text-[#f7a7a7] ring-1 ring-[rgb(240_106_106/0.35)]">
                  <AlertCircle className="mt-px h-4 w-4 flex-shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de consulta">
                  {KINDS.map((k) => (
                    <button
                      key={k.kind}
                      type="button"
                      role="radio"
                      aria-checked={kind === k.kind}
                      onClick={() => setKind(k.kind)}
                      className={`rounded-[10px] border px-2 py-2.5 text-[0.8rem] font-medium leading-tight transition-colors ${
                        kind === k.kind
                          ? "border-[rgb(139_127_255/0.6)] bg-[var(--accent-soft)] text-white"
                          : "border-[var(--line)] text-[var(--fg-2)] hover:text-white"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="ct-name" label="Nombre">
                    <input id="ct-name" className="nl-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
                  </Field>
                  <Field id="ct-email" label="Email">
                    <input id="ct-email" type="email" className="nl-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={160} />
                  </Field>
                  <Field id="ct-company" label={needsCompany ? "Empresa" : "Empresa (opcional)"}>
                    <input id="ct-company" className="nl-input" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" required={needsCompany} maxLength={120} />
                  </Field>
                  <Field id="ct-phone" label="Teléfono (opcional)">
                    <input id="ct-phone" type="tel" className="nl-input" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={40} placeholder="+54 11 …" />
                  </Field>
                </div>

                <Field id="ct-message" label="Mensaje">
                  <textarea
                    id="ct-message"
                    className="nl-input h-auto py-3 leading-relaxed"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={current.placeholder}
                    required
                    maxLength={2000}
                  />
                </Field>

                <TurnstileWidget />
                <button type="submit" className="nl-btn nl-btn--primary w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Enviar
                </button>
                <p className="text-xs text-[var(--fg-3)]">Usamos tus datos solo para responderte.</p>
              </div>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-[var(--fg)]">{label}</label>
      {children}
    </div>
  );
}
