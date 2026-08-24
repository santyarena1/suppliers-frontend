"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Diagnóstico vive dentro de Administración. */
export default function DiagnosticsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin?tab=diagnostics");
  }, [router]);
  return null;
}
