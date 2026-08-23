"use client";

import { useEffect, useState } from "react";
import { cachedMyProviders, loadMyProviders, type Provider, type VisibleProvider } from "@/lib/api";

/**
 * Los proveedores que existen para la organización de quien está usando NODO.
 *
 * El descubrimiento es cerrado: un comercio conoce a los distribuidores con los que
 * tiene vínculo y a los que pagaron publicidad, y nada más. El resto no aparece ni
 * como opción deshabilitada — para ese comercio no existen.
 */
export function useMyProviders(): { providers: VisibleProvider[]; loading: boolean } {
  const cached = cachedMyProviders();
  const [providers, setProviders] = useState<VisibleProvider[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    let alive = true;
    loadMyProviders().then((list) => {
      if (!alive) return;
      setProviders(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { providers, loading };
}

/** Solo los vinculados, que son los que tienen catálogo. */
export function useLinkedProviders(): { providers: Provider[]; loading: boolean } {
  const { providers, loading } = useMyProviders();
  return { providers: providers.filter((p) => p.linked).map((p) => p.provider), loading };
}
