"use client";

import { use, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ListImportReview from "@/components/list-import/ListImportReview";
import { storefrontApi, type Provider } from "@/lib/api";

/** Revisión de una planilla de la tienda propia. */
export default function StorefrontImportReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = use(params);
  const [provider, setProvider] = useState<Provider | null | undefined>(undefined);
  useEffect(() => {
    storefrontApi
      .mine()
      .then((r) => setProvider(r.data.exists ? r.data.provider : null))
      .catch(() => setProvider(null));
  }, []);
  if (provider === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      </div>
    );
  }
  if (provider === null) return <p className="p-6 text-sm text-surface-400">Primero abrí tu tienda en Vender en NODO.</p>;
  return <ListImportReview provider={provider} importId={importId} basePath="/vender" listsHref="/vender?tab=productos" />;
}
