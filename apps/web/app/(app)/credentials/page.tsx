"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * La gestión de credenciales se unificó dentro de cada proveedor
 * (/proveedores/[provider], tab "Mi cuenta") junto con configuración y
 * sincronización, para no tener todo esparcido en módulos separados.
 */
export default function CredentialsRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/proveedores"); }, [router]);
  return null;
}
