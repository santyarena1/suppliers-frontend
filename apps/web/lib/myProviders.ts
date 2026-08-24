"use client";

import { useEffect, useState } from "react";
import {
  cachedMyProviders,
  loadMyProviders,
  MY_PROVIDERS_UPDATED,
  type Provider,
  type VisibleProvider,
} from "@/lib/api";

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

    function apply(list: VisibleProvider[]) {
      if (!alive) return;
      setProviders(list);
      setLoading(false);
    }

    void loadMyProviders().then(apply);
    function onUpdated() {
      void loadMyProviders(true).then(apply);
    }
    window.addEventListener(MY_PROVIDERS_UPDATED, onUpdated);
    return () => {
      alive = false;
      window.removeEventListener(MY_PROVIDERS_UPDATED, onUpdated);
    };
  }, []);

  return { providers, loading };
}

/** Solo los vinculados, que son los que tienen catálogo. */
export function useLinkedProviders(): { providers: Provider[]; loading: boolean } {
  const { providers, loading } = useMyProviders();
  return { providers: providers.filter((p) => p.linked).map((p) => p.provider), loading };
}
