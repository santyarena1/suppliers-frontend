"use client";

import { useEffect, useState } from "react";
import { permissionsApi, ModuleKey } from "./api";

let cache: ModuleKey[] | null = null;
let inflight: Promise<ModuleKey[] | null> | null = null;

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
      // Navbar — eso deja al usuario sin poder ni siquiera loguearse de nuevo
      // por su cuenta. `null` = "no lo sabemos, mostrar todo" (fail-open);
      // las restricciones reales igual se aplican del lado del backend.
      .catch(() => null);
  }
  return inflight;
}

/**
 * Módulos habilitados para el usuario logueado (por rol + excepciones que
 * cargó el superadmin). Devuelve `null` mientras carga o si falló la
 * consulta — el Navbar no debe ocultar nada sin una respuesta real, para no
 * parpadear ni dejar a nadie bloqueado por un error transitorio.
 */
export function useMyModules(): ModuleKey[] | null {
  const [modules, setModules] = useState<ModuleKey[] | null>(cache);

  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) setModules(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return modules;
}
