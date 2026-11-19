"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { NODO_MERCADOPAGO_URL } from "@/lib/contact";

type Checkout = { url: string; dynamic: boolean; amountUsd: number | null; amountArs: number | null; rate: number | null };

/**
 * Abre Mercado Pago con la cuota de hoy: NODO arma el cobro en el momento con el
 * precio vigente del plan, en pesos al dólar oficial del día. Si no se puede, el
 * link fijo de siempre.
 */
export default function MercadoPagoButton({
  size = "md",
  label = "Pagar con Mercado Pago",
  onClick,
}: {
  size?: "sm" | "md";
  label?: string;
  onClick?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const sizing = size === "sm" ? "rounded-lg px-3 py-1.5 text-xs" : "rounded-xl px-4 py-2 text-sm";

  async function pay(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    onClick?.();
    // La pestaña se abre ya (con el clic), así el navegador no la bloquea.
    const tab = window.open("", "_blank");
    setBusy(true);
    let url = NODO_MERCADOPAGO_URL;
    try {
      const res = await api.post<Checkout>("/my/subscription/mercadopago");
      if (res.data?.url) url = res.data.url;
    } catch {
      /* el link fijo */
    } finally {
      setBusy(false);
    }
    if (tab) tab.location.href = url;
    else window.location.href = url;
  }

  return (
    <a
      href={NODO_MERCADOPAGO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => void pay(e)}
      aria-busy={busy}
      className={`inline-flex items-center gap-1.5 bg-[#009ee3] font-semibold text-white hover:bg-[#0089c7] ${busy ? "opacity-80" : ""} ${sizing}`}
    >
      {busy ? <Loader2 className={`animate-spin ${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}`} /> : <CreditCard className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />} {label}
    </a>
  );
}
