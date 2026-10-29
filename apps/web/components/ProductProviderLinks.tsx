"use client";

import { ExternalLink } from "lucide-react";
import { providerLabel } from "@/components/ProviderBadge";
import { useMyProviders } from "@/lib/myProviders";
import { providerPortal, providerProductLink } from "@/lib/providerLinks";

const BTN =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors";

/**
 * Cómo ir al proveedor desde la ficha: el producto en su portal si tenemos o
 * sabemos armar el link (o su búsqueda), si no su portal. La tienda de un local
 * tiene su propia tarjeta (`StorefrontProductInfo`), con WhatsApp y condiciones.
 */
export default function ProductProviderLinks({
  provider,
  productUrl,
  externalId,
  partNumber,
  productName,
}: {
  provider: string;
  productUrl?: string | null;
  externalId?: string | null;
  partNumber?: string | null;
  productName?: string | null;
}) {
  const { providers } = useMyProviders();
  const row = providers.find((p) => p.provider === provider);
  const name = row?.name || providerLabel(provider);

  if (row?.storefront) return null;

  const link = providerProductLink(provider, { productUrl, externalId, partNumber, name: productName });
  const product = link?.url ?? null;
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
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {link?.exact ? `Ver el producto en ${name}` : `Buscarlo en ${name}`}
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
