"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import SystemUnavailable from "@/components/system/SystemUnavailable";
import {
  getSystemHealth,
  probeSystemHealth,
  reportSystemDown,
  reportSystemOk,
  reportSystemUpdating,
  subscribeSystemHealth,
  type SystemHealthSnapshot,
} from "@/lib/system-health";

const HEALTHY_MS = 25_000;
const UNHEALTHY_MS = 5_000;
/** Fallos seguidos antes de tapar la UI (evita un glitch de red). */
const FAIL_THRESHOLD = 2;
/** Rutas donde no cubrimos la pantalla (ya muestran el estado). */
const SKIP_PREFIXES = ["/actualizacion"];

/**
 * Vigila GET /health. Si el API cae o está en recovery de DB, muestra la
 * pantalla de actualización / no disponible encima de toda la app.
 */
export default function ApiHealthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [snap, setSnap] = useState<SystemHealthSnapshot>(() => getSystemHealth());
  const fails = useRef(0);
  const [blocked, setBlocked] = useState(false);

  const skip = SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    return subscribeSystemHealth((next) => {
      setSnap(next);
      if (next.kind === "ok") {
        fails.current = 0;
        setBlocked(false);
        return;
      }
      // updating (recovery) o down ya confirmado: mostrar.
      fails.current = FAIL_THRESHOLD;
      setBlocked(true);
    });
  }, []);

  useEffect(() => {
    if (skip) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ac = new AbortController();

    const tick = async () => {
      const result = await probeSystemHealth(ac.signal);
      if (cancelled) return;

      if (result.kind === "ok") {
        fails.current = 0;
        reportSystemOk();
        setBlocked(false);
      } else if (result.kind === "updating") {
        fails.current = FAIL_THRESHOLD;
        reportSystemUpdating(result.message);
        setBlocked(true);
      } else {
        fails.current += 1;
        if (fails.current >= FAIL_THRESHOLD) {
          reportSystemDown(result.message);
          setBlocked(true);
        }
      }

      const delay = result.kind === "ok" ? HEALTHY_MS : UNHEALTHY_MS;
      timer = setTimeout(tick, delay);
    };

    void tick();

    return () => {
      cancelled = true;
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [skip]);

  const show =
    !skip &&
    blocked &&
    snap.kind !== "ok" &&
    (snap.kind === "updating" || snap.kind === "down");

  if (!show) return <>{children}</>;

  return (
    <SystemUnavailable
      variant={snap.kind === "updating" ? "updating" : "down"}
      message={snap.message}
      brandAsText
      onRetry={() => {
        void probeSystemHealth().then((r) => {
          if (r.kind === "ok") {
            fails.current = 0;
            reportSystemOk();
            setBlocked(false);
            return;
          }
          if (r.kind === "updating") {
            reportSystemUpdating(r.message);
            setBlocked(true);
            return;
          }
          reportSystemDown(r.message);
          setBlocked(true);
        });
      }}
    />
  );
}
