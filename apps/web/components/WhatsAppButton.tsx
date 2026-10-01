"use client";

import { MessageCircle } from "lucide-react";
import { getUser } from "@/lib/auth";
import { whatsappUrl } from "@/lib/contact";

/** Texto prellenado para coordinar el pago de la suscripción. */
export function paymentWhatsappText(orgName?: string | null): string {
  return orgName
    ? `Hola, soy de ${orgName} y quiero coordinar el pago de NODO.`
    : "Hola, quiero coordinar el pago de NODO.";
}

interface Props {
  text?: string;
  label?: string;
  /** Usa el nombre de la organización de la sesión para el mensaje de pago. */
  forPayment?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Abre WhatsApp con NODO. Verde de WhatsApp para que se reconozca al instante. */
export default function WhatsAppButton({ text, label = "Escribinos por WhatsApp", forPayment, size = "md", className = "" }: Props) {
  const message = forPayment ? paymentWhatsappText(getUser()?.tenantName) : text;
  const sizing = size === "sm" ? "px-3 py-1.5 text-xs rounded-lg" : "px-4 py-2 text-sm rounded-xl";
  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-1.5 bg-[#1f9d55] font-semibold text-white transition hover:bg-[#23b360] active:scale-[0.98] ${sizing} ${className}`}
    >
      <MessageCircle className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label}
    </a>
  );
}
