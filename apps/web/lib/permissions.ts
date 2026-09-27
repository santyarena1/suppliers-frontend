"use client";

import { useEffect, useState } from "react";
import { myApi, permissionsApi, ModuleKey, type PermissionKey } from "./api";

let cache: ModuleKey[] | null = null;
let inflight: Promise<ModuleKey[] | null> | null = null;
const listeners = new Set<() => void>();

export function invalidateMyModules() {
  cache = null;
  inflight = null;
  orgCache = null;
  orgInflight = null;
  listeners.forEach((fn) => fn());
}

async function load(): Promise<ModuleKey[] | null> {
  if (cache) return cache;
  if (!inflight) {
    inflight = permissionsApi
      .mine()
      .then((res) => {
        cache = Array.isArray(res.data) ? res.data : null;
        return cache;
      })
      // Si falla (token vencido, red, lo que sea) no hay que ocultar todo el
      // sidebar — eso deja al usuario sin poder ni siquiera loguearse de nuevo
      // por su cuenta. `null` = "no lo sabemos, mostrar todo" (fail-open);
      // las restricciones reales igual se aplican del lado del backend.
      .catch(() => null);
  }
  return inflight;
}

/**
 * Módulos habilitados para el usuario logueado (por rol + excepciones que
 * cargó el superadmin). Devuelve `null` mientras carga o si falló la
 * consulta — el sidebar no debe ocultar nada sin una respuesta real, para no
 * parpadear ni dejar a nadie bloqueado por un error transitorio.
 */
export function useMyModules(): ModuleKey[] | null {
  const [modules, setModules] = useState<ModuleKey[] | null>(cache);
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
    load().then((m) => {
      if (alive) setModules(m);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  return modules;
}

// --- Permisos dentro de la organización ---

let orgCache: Set<PermissionKey> | null = null;
let orgInflight: Promise<Set<PermissionKey> | null> | null = null;

async function loadOrgPermissions(): Promise<Set<PermissionKey> | null> {
  if (orgCache) return orgCache;
  if (!orgInflight) {
    orgInflight = myApi
      .permissions()
      .then((res) => {
        orgCache = new Set(res.data.permissions);
        return orgCache;
      })
      // Sin organización (superadmin) o error: `null`. Quien decide es el servidor.
      .catch(() => null);
  }
  return orgInflight;
}

/** Permisos efectivos de la sesión en su organización; `null` mientras carga o si no se pudo saber. */
export function useMyPermissions(): ReadonlySet<PermissionKey> | null {
  const [perms, setPerms] = useState<Set<PermissionKey> | null>(orgCache);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadOrgPermissions().then((p) => {
      if (alive) setPerms(p);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  return perms;
}

/**
 * ¿La sesión tiene este permiso en su organización? `null` mientras carga o si
 * no se pudo saber: la pantalla no debería esconder nada sin una respuesta real.
 */
export function useCan(key: PermissionKey): boolean | null {
  const perms = useMyPermissions();
  return perms ? perms.has(key) : null;
}
