"use client";

import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ImportProfileView from "@/components/list-import/ImportProfileView";
import { storefrontApi, type Provider } from "@/lib/api";

/** Qué columna es cada dato en la planilla de la tienda propia. */
export default function StorefrontImportProfilePage() {
  const provider = useOwnStorefrontKey();
  if (provider === undefined) return <Loading />;
  if (provider === null) return <p className="p-6 text-sm text-surface-400">Primero abrí tu tienda en Vender en NODO.</p>;
  return (
    <Suspense fallback={<Loading />}>
      <ImportProfileView provider={provider} basePath="/vender" listsHref="/vender?tab=productos" />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
    </div>
  );
}

/** `undefined` mientras carga; `null` si no hay tienda. */
function useOwnStorefrontKey(): Provider | null | undefined {
  const [key, setKey] = useState<Provider | null | undefined>(undefined);
  useEffect(() => {
    storefrontApi
      .mine()
      .then((r) => setKey(r.data.exists ? r.data.provider : null))
      .catch(() => setKey(null));
  }, []);
  return key;
}
