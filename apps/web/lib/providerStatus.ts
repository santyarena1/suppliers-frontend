"use client";

import { useEffect, useState } from "react";
import { IMPLEMENTED_PROVIDERS, providersApi, type ProviderStatus } from "@/lib/api";

export type ProviderStatusMap = Partial<Record<string, ProviderStatus>>;

let cache: ProviderStatusMap | null = null;
let inflight: Promise<ProviderStatusMap> | null = null;
let fetchedAt = 0;
const TTL_MS = 30_000;

async function load(force = false): Promise<ProviderStatusMap> {
  if (!force && cache && Date.now() - fetchedAt < TTL_MS) return cache;
  if (!force && inflight) return inflight;

  inflight = Promise.allSettled(IMPLEMENTED_PROVIDERS.map((p) => providersApi.status(p)))
    .then((results) => {
      const map: ProviderStatusMap = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") map[IMPLEMENTED_PROVIDERS[i]] = r.value.data;
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

export function useProviderStatuses(): ProviderStatusMap {
  const [statuses, setStatuses] = useState<ProviderStatusMap>(cache ?? {});

  useEffect(() => {
    let alive = true;
    load().then((map) => {
      if (alive) setStatuses(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  return statuses;
}
