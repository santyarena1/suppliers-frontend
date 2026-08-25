"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTenant } from "@/lib/auth";

/** Si entra un distribuidor a una pantalla de compra, lo manda a su cartera. */
export function useRetailerOnly(fallback = "/cartera") {
  const router = useRouter();
  useEffect(() => {
    if (getTenant()?.type === "DISTRIBUTOR") router.replace(fallback);
  }, [router, fallback]);
}
