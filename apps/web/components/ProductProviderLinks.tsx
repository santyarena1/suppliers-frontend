"use client";

import { ExternalLink, MessageCircle } from "lucide-react";
import { providerLabel } from "@/components/ProviderBadge";
import { useMyProviders } from "@/lib/myProviders";
import { providerPortal, safeHttpUrl } from "@/lib/providerLinks";
import { whatsappLink } from "@/lib/storefront";

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";

/**
 * Cómo ir al proveedor desde la ficha: el producto en su portal si tenemos el
 * link, si no su portal; a la tienda de un local, por WhatsApp.
 */
export default function ProductProviderLinks({
  provider,
  productUrl,
  productName,
}: {
  provider: string;
  productUrl?: string | null;
  productName: string;
}) {
  const { providers } = useMyProviders();
  const row = providers.find((p) => p.provider === provider);
  const name = row?.name || providerLabel(provider);

  if (row?.storefront) {
    const wa = whatsappLink(row.storefrontContact?.phone, `Hola, te escribo por "${productName}" que publicaste en NODO.`);
    if (!wa && !row.storefrontContact?.note) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BTN} border-emerald-500/30 bg-emerald-500/5 text-emerald-100 hover:bg-emerald-500/10`}
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Escribirle a {name}
          </a>
        )}
        {row.storefrontContact?.note && <span className="text-xs text-surface-400">{row.storefrontContact.note}</span>}
      </div>
    );
  }

  const product = safeHttpUrl(productUrl);
  const portal = providerPortal(provider);
  if (!product && !portal) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {product ? (
        <a
          href={product}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN} border-brand-500/30 bg-brand-600/10 text-brand-100 hover:bg-brand-600/20`}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ver el producto en {name}
        </a>
      ) : null}
      {portal && (
        <a
          href={portal.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN} border-surface-700 text-surface-200 hover:border-surface-500 hover:text-white`}
          title={portal.url}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {product ? "Portal" : `Ir al portal de ${name}`}
        </a>
      )}
    </div>
  );
}
