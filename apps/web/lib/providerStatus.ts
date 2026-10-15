"use client";

import { useEffect, useState } from "react";
import { listImportsApi, loadLinkedProviders, providersApi, type FreshnessStatus, type ProviderStatus } from "@/lib/api";
import { connectsByList } from "@/lib/providerDot";

/** Estado de cada proveedor; los de lista traen además la vigencia de la lista. */
export type ProviderStatusMap = Partial<Record<string, ProviderStatus & { listFreshness?: FreshnessStatus }>>;

let cache: ProviderStatusMap | null = null;
let inflight: Promise<ProviderStatusMap> | null = null;
let fetchedAt = 0;
const TTL_MS = 30_000;

async function load(force = false): Promise<ProviderStatusMap> {
  if (!force && cache && Date.now() - fetchedAt < TTL_MS) return cache;
  if (!force && inflight) return inflight;

  inflight = loadLinkedProviders()
    .then(async (providers) => {
      const [results, fresh] = await Promise.all([
        Promise.allSettled(providers.map((p) => providersApi.status(p))),
        Promise.allSettled(providers.map((p) => (connectsByList(p) ? listImportsApi.freshness(p) : Promise.resolve(null)))),
      ]);
      const map: ProviderStatusMap = {};
      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const f = fresh[i];
        map[providers[i]] = {
          ...r.value.data,
          ...(f.status === "fulfilled" && f.value ? { listFreshness: f.value.data.status } : {}),
        };
      });
      cache = map;
      fetchedAt = Date.now();
      return map;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateProviderStatuses() {
  cache = null;
  fetchedAt = 0;
  inflight = null;
}

export function useProviderStatuses(): { statuses: ProviderStatusMap; loading: boolean } {
  const [statuses, setStatuses] = useState<ProviderStatusMap>(cache ?? {});
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    if (!cache) setLoading(true);
    load().then((map) => {
      if (!alive) return;
      setStatuses(map);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { statuses, loading };
}
