"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { retailSuppliersApi } from "@/lib/api";

/**
 * Locales que aceptan el carrito por link (Compra Gamer): abre su web con los
 * productos ya cargados. El comercio entra con su cuenta y paga ahí.
 */
export default function RetailCartLinkButton({
  provider,
  name,
  items,
}: {
  provider: string;
  name: string;
  items: { externalId: string; qty: number }[];
}) {
  const [link, setLink] = useState<{ url: string | null; missing: number } | null>(null);
  const key = items.map((i) => `${i.externalId}x${i.qty}`).join(",");

  useEffect(() => {
    if (!provider.startsWith("LIST_RETAIL_") || items.length === 0) {
      setLink(null);
      return;
    }
    let cancelled = false;
    retailSuppliersApi
      .cartLink(provider, items)
      .then((res) => !cancelled && setLink({ url: res.data.url, missing: res.data.missing.length }))
      .catch(() => !cancelled && setLink(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, key]);

  if (!link?.url) return null;
  return (
    <div className="flex flex-col gap-1">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start flex items-center gap-2 bg-surface-800 hover:bg-surface-700 border border-surface-700 text-surface-100 text-sm font-medium rounded-lg px-3 py-2"
      >
        <ExternalLink className="w-3.5 h-3.5" /> Abrir carrito en {name}
      </a>
      <p className="text-[11px] text-surface-500">
        Se abre su web con estos productos cargados: entrás con tu cuenta y pagás ahí.
        {link.missing > 0 ? ` ${link.missing} producto${link.missing === 1 ? "" : "s"} no se pudo${link.missing === 1 ? "" : "ieron"} sumar al link.` : ""}
      </p>
    </div>
  );
}
