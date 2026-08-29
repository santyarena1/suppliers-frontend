"use client";

import { useEffect, useState } from "react";
import { tgsApi } from "./tgs-api";

let cache: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export function invalidateTgsEnabled() {
  cache = null;
  inflight = null;
  listeners.forEach((fn) => fn());
}

async function load(): Promise<boolean> {
  if (cache !== null) return cache;
  if (!inflight) {
    inflight = tgsApi
      .enabled()
      .then((res) => {
        cache = Boolean(res.data?.enabled);
        return cache;
      })
      .catch(() => {
        cache = false;
        return false;
      });
  }
  return inflight;
}

/**
 * Fail-closed: mientras no sepamos, el ítem no aparece. El backend es quien
 * realmente deja entrar; esto solo decide el menú.
 */
export function useTgsEnabled(): boolean {
  const [enabled, setEnabled] = useState(cache === true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = () => setTick((n) => n + 1);
    listeners.add(unsub);
    return () => {
      listeners.delete(unsub);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((value) => {
      if (alive) setEnabled(value);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  return enabled;
}
