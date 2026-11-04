"use client";

import { CreditCard } from "lucide-react";
import { NODO_MERCADOPAGO_URL } from "@/lib/contact";

/** Abre el link de pago de Mercado Pago de los planes de NODO en otra pestaña. */
export default function MercadoPagoButton({
  size = "md",
  label = "Pagar con Mercado Pago",
  onClick,
}: {
  size?: "sm" | "md";
  label?: string;
  onClick?: () => void;
}) {
  const sizing = size === "sm" ? "rounded-lg px-3 py-1.5 text-xs" : "rounded-xl px-4 py-2 text-sm";
  return (
    <a
      href={NODO_MERCADOPAGO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 bg-[#009ee3] font-semibold text-white hover:bg-[#0089c7] ${sizing}`}
    >
      <CreditCard className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} /> {label}
    </a>
  );
}
