"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { retailSuppliersApi } from "@/lib/api";

/**
 * Locales que aceptan el carrito por link (Compra Gamer): guarda el pedido en
 * NODO y abre su web con los productos ya cargados. El comercio entra con su
 * cuenta y paga ahí; NODO no toca su cuenta.
 */
export default function RetailCartLinkButton({
  provider,
  name,
  items,
  onReady,
  onOrder,
  disabled,
}: {
  provider: string;
  name: string;
  items: { externalId: string; qty: number }[];
  /** Avisa si este local tiene carrito por link para estos productos. */
  onReady?: (ready: boolean) => void;
  /** Guarda el pedido en NODO. `false` = no abrir el carrito (falló o espera aprobación). */
  onOrder: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const [link, setLink] = useState<{ url: string | null; missing: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = items.map((i) => `${i.externalId}x${i.qty}`).join(",");

  useEffect(() => {
    if (!provider.startsWith("LIST_RETAIL_") || items.length === 0) {
      setLink(null);
      onReady?.(false);
      return;
    }
    let cancelled = false;
    retailSuppliersApi
      .cartLink(provider, items)
      .then((res) => {
        if (cancelled) return;
        setLink({ url: res.data.url, missing: res.data.missing.length });
        onReady?.(Boolean(res.data.url));
      })
      .catch(() => {
        if (cancelled) return;
        setLink(null);
        onReady?.(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, key]);

  async function open() {
    if (!link?.url || busy) return;
    // La pestaña se abre ya (si se abre después de esperar al servidor, el
    // navegador la bloquea) y se le pone la dirección cuando el pedido quedó guardado.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const ok = await onOrder();
      if (!ok) {
        tab?.close();
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = link.url;
      } else {
        window.location.href = link.url;
      }
    } finally {
      setBusy(false);
    }
  }

  if (!link?.url) return null;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy || disabled}
        className="self-start flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-3 py-2"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
        {busy ? "Guardando…" : `Armar carrito en ${name}`}
      </button>
      <p className="text-[11px] text-surface-500">
        Queda como pedido en NODO y se abre su web con estos productos cargados: entrás con tu cuenta y pagás ahí.
        {link.missing > 0 ? ` ${link.missing} producto${link.missing === 1 ? "" : "s"} no se pudo${link.missing === 1 ? "" : "ieron"} sumar al carrito.` : ""}
      </p>
    </div>
  );
}
