"use client";

import { useEffect, useState } from "react";
import { subscriptionApi } from "@/lib/api";
import { getTenant, getUser, SESSION_EVENT } from "@/lib/auth";
import type { MySubscription, PlanCapabilityKey } from "@/lib/plans";

export const SUBSCRIPTION_UPDATED = "nodo:subscription";

let cached: { key: string; value: MySubscription | null } | null = null;
let inflight: { key: string; promise: Promise<MySubscription | null> } | null = null;

function sessionKey(): string {
  const tenant = getTenant();
  return `${getUser()?.username ?? ""}|${tenant?.id ?? ""}`;
}

/** Solo los comercios tienen plan comercial. */
export function sessionHasSubscription(): boolean {
  return getTenant()?.type === "RETAILER";
}

export function cachedSubscription(): MySubscription | null {
  const key = sessionKey();
  return cached?.key === key ? cached.value : null;
}

export async function loadSubscription(force = false): Promise<MySubscription | null> {
  if (typeof window === "undefined" || !sessionHasSubscription()) return null;
  const key = sessionKey();
  if (!force && cached?.key === key) return cached.value;
  if (!force && inflight?.key === key) return inflight.promise;
  const promise = subscriptionApi
    .mine()
    .then((r) => r.data)
    .catch(() => null)
    .then((value) => {
      cached = { key, value };
      if (inflight?.key === key) inflight = null;
      return value;
    });
  inflight = { key, promise };
  return promise;
}

export function invalidateSubscription() {
  cached = null;
  inflight = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SUBSCRIPTION_UPDATED));
}

if (typeof window !== "undefined") {
  window.addEventListener(SESSION_EVENT, () => {
    cached = null;
    inflight = null;
  });
}

/**
 * ¿La capacidad está disponible? Mientras no cargó (o si no es un comercio) se
 * asume que sí: esconder de más rompe más que mostrar un botón que el backend
 * igual va a cortar.
 */
export function capabilityAllowed(sub: MySubscription | null, key: PlanCapabilityKey): boolean {
  if (!sub) return true;
  return sub.access === "FULL" && sub.capabilities[key];
}

export function useSubscription(): { subscription: MySubscription | null; loading: boolean; reload: () => void } {
  const [subscription, setSubscription] = useState<MySubscription | null>(() => cachedSubscription());
  const [loading, setLoading] = useState(() => sessionHasSubscription() && cachedSubscription() === null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const apply = (value: MySubscription | null) => {
      if (!alive) return;
      setSubscription(value);
      setLoading(false);
    };
    void loadSubscription(tick > 0).then(apply);
    const onUpdated = () => void loadSubscription().then(apply);
    const onSession = () => void loadSubscription(true).then(apply);
    window.addEventListener(SUBSCRIPTION_UPDATED, onUpdated);
    window.addEventListener(SESSION_EVENT, onSession);
    return () => {
      alive = false;
      window.removeEventListener(SUBSCRIPTION_UPDATED, onUpdated);
      window.removeEventListener(SESSION_EVENT, onSession);
    };
  }, [tick]);

  return { subscription, loading, reload: () => setTick((t) => t + 1) };
}
