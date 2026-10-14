"use client";

import { use } from "react";
import ListImportReview from "@/components/list-import/ListImportReview";
import type { Provider } from "@/lib/api";

/** Revisión de una carga de lista de un proveedor. */
export default function ListImportReviewPage({ params }: { params: Promise<{ provider: string; importId: string }> }) {
  const { provider: raw, importId } = use(params);
  const provider = raw.toUpperCase() as Provider;
  return (
    <ListImportReview
      provider={provider}
      importId={importId}
      basePath={`/proveedores/${provider}`}
      listsHref={`/proveedores/${provider}?tab=lists`}
    />
  );
}
