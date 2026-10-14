"use client";

import { use } from "react";
import ImportProfileView from "@/components/list-import/ImportProfileView";
import type { Provider } from "@/lib/api";

/** Editor del perfil de lectura de la lista de un proveedor. */
export default function ImportProfilePage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = use(params);
  const provider = raw.toUpperCase() as Provider;
  return <ImportProfileView provider={provider} basePath={`/proveedores/${provider}`} listsHref={`/proveedores/${provider}?tab=lists`} />;
}
