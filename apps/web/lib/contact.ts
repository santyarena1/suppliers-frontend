/** Contacto directo con NODO: el mismo número en la landing, el alta y Plan y facturación. */
export const NODO_WHATSAPP = "5491140859342";
export const NODO_WHATSAPP_LABEL = "+54 9 11 4085-9342";

export function whatsappUrl(text?: string): string {
  const base = `https://wa.me/${NODO_WHATSAPP}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Link de WhatsApp a un teléfono cualquiera (bandeja de Solicitudes). Null si no parece un número. */
export function whatsappForPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const withCountry = digits.startsWith("54") ? digits : `54${digits.replace(/^0/, "")}`;
  return `https://wa.me/${withCountry}`;
}

export type LandingContactKind = "CONTACT" | "CUSTOM" | "SUPPLIER" | "BRAND";

/** Evento con el que un CTA de la landing elige el tipo de consulta del formulario de contacto. */
export const CONTACT_KIND_EVENT = "nodo:contact-kind";

export function announceContactKind(kind: LandingContactKind) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<LandingContactKind>(CONTACT_KIND_EVENT, { detail: kind }));
}
