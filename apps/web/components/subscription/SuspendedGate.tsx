"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { useSubscription } from "@/lib/subscription";

/** Pantallas que son operación pura: con la cuenta suspendida no tienen nada para mostrar. */
const OPERATIONAL = ["/search", "/comparador", "/cart", "/mensajes"];

function isOperational(pathname: string) {
  return OPERATIONAL.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Con la suscripción suspendida el comercio entra, ve sus pedidos, proveedores,
 * equipo y su suscripción, pero no opera. El backend es quien lo corta; esto
 * evita pantallas que fallan una por una.
 */
export default function SuspendedGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { subscription } = useSubscription();
  if (!subscription || subscription.access !== "RESTRICTED" || !isOperational(pathname)) return <>{children}</>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold text-white">Tu cuenta de NODO está suspendida</h1>
        <p className="mt-3 text-sm text-surface-300">
          No se borró nada: tus proveedores, credenciales, listas, pedidos y equipo siguen tal cual. Mientras tanto
          podés entrar, ver tus datos y tu suscripción. Cuando se registre el pago, todo vuelve a funcionar al instante.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/suscripcion"
            className="inline-flex items-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
          >
            Regularizar suscripción
          </Link>
          <Link
            href="/pedidos"
            className="inline-flex items-center rounded-xl border border-surface-700 px-4 py-2 text-sm text-surface-200 hover:bg-surface-800"
          >
            Ver mis pedidos
          </Link>
        </div>
      </div>
    </div>
  );
}
