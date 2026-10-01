"use client";

import { useState } from "react";
import { AlertCircle, ArrowRight, Check, Loader2, MessageCircle } from "lucide-react";
import { apiFailure } from "@/lib/api";
import { contactApi } from "@/lib/inbox";
import { NODO_WHATSAPP_LABEL, whatsappUrl } from "@/lib/contact";

type Kind = "SUPPLIER" | "BRAND";

const KIND_LABEL: Record<Kind, string> = { SUPPLIER: "Distribuidor", BRAND: "Marca" };

/**
 * Alta de quien vende (distribuidor o marca): no crea un comercio. Deja una
 * solicitud para que NODO arme su espacio y lo contacte.
 */
export default function SupplierJoinCard({ defaultEmail }: { defaultEmail?: string }) {
  const [kind, setKind] = useState<Kind>("SUPPLIER");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await contactApi.joinRequest({
        kind,
        company: company.trim(),
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
        message: message.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(apiFailure(err).message || "No se pudo enviar. Probá de nuevo o escribinos por WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  const waText = `Hola, soy ${KIND_LABEL[kind].toLowerCase()}${company.trim() ? ` (${company.trim()})` : ""} y quiero sumarme a NODO.`;

  if (sent) {
    return (
      <div className="lnd-panel lnd-panel--sheer ob__card lnd-done" role="status">
        <span className="lnd-done__icon"><Check className="w-5 h-5" /></span>
        <p className="lnd-label">Solicitud enviada</p>
        <h2 className="ob__card-title">Te contactamos en menos de 24 h hábiles</h2>
        <p className="lnd-body">
          Recibimos los datos de {company.trim()}. Armamos tu espacio de {KIND_LABEL[kind].toLowerCase()} con vos
          {defaultEmail ? <> y te escribimos a <strong>{defaultEmail}</strong></> : null}. Si preferís adelantarlo, escribinos por
          WhatsApp.
        </p>
        <a className="lnd-wa" href={whatsappUrl(waText)} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="w-4 h-4" /> WhatsApp {NODO_WHATSAPP_LABEL}
        </a>
      </div>
    );
  }

  return (
    <form className="lnd-panel lnd-panel--sheer ob__card" onSubmit={submit}>
      <p className="lnd-label">Distribuidores y marcas</p>
      <h2 className="ob__card-title">Contanos quién sos</h2>
      <p className="lnd-body">
        El espacio para los que venden lo armamos con vos. Dejanos tus datos y te contactamos para habilitarlo.
      </p>

      {error && (
        <p className="ob__error" role="alert">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}

      <div className="ob__field">
        <span className="lnd-label">Soy</span>
        <div className="lnd-seg" role="group" aria-label="Tipo de empresa">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <label className="ob__field">
        <span className="lnd-label">{kind === "BRAND" ? "Marca" : "Empresa"}</span>
        <input
          className="lnd-input"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={kind === "BRAND" ? "Ej. Gigabyte Argentina" : "Ej. Distribuidora Norte"}
          required
          minLength={2}
          maxLength={120}
        />
      </label>
      <label className="ob__field">
        <span className="lnd-label">Teléfono o WhatsApp</span>
        <input className="lnd-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 11 …" maxLength={40} />
      </label>
      <label className="ob__field">
        <span className="lnd-label">Web (opcional)</span>
        <input className="lnd-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.tuempresa.com" maxLength={200} />
      </label>
      <label className="ob__field">
        <span className="lnd-label">Mensaje (opcional)</span>
        <textarea
          className="lnd-input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={kind === "BRAND" ? "Con qué distribuidores trabajás, qué querés mostrar." : "Qué vendés y a cuántos comercios."}
          maxLength={2000}
        />
      </label>

      <button type="submit" className="lnd-btn lnd-btn--primary" disabled={busy || company.trim().length < 2}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Enviar solicitud
        <ArrowRight className="w-4 h-4 lnd-btn__arrow" />
      </button>
      <p className="lnd-note">No se crea ningún comercio: te contactamos y armamos tu espacio.</p>
    </form>
  );
}
