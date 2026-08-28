"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Package, RotateCcw, ShoppingBag, ShoppingBasket, Truck, Users, Wallet } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsEmpty, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsScopeClass, tgsScopeLabel } from "@/components/tgs/tgs-format";
import { TGS_MODULES, tgsApi, type TgsMe, type TgsModule } from "@/lib/tgs-api";

const CARDS: { href: string; label: string; desc: string; icon: typeof Package; module: TgsModule }[] = [
  { href: "/sistema-tgs/stock", label: "Stock", desc: "Depósito, catalogado y disponible", icon: Package, module: "stock" },
  { href: "/sistema-tgs/clientes", label: "Clientes", desc: "Agenda y saldo de cuenta", icon: Users, module: "clientes" },
  { href: "/sistema-tgs/ventas", label: "Ventas", desc: "Comprobantes e ítems", icon: ShoppingBag, module: "ventas" },
  { href: "/sistema-tgs/productos-vendidos", label: "Productos vendidos", desc: "Detalle por línea de venta", icon: ShoppingBasket, module: "ventas" },
  { href: "/sistema-tgs/compras", label: "Compras", desc: "Ingresos de proveedores", icon: Truck, module: "compras" },
  { href: "/sistema-tgs/ctacte", label: "Cuenta corriente", desc: "Movimientos de clientes y proveedores", icon: Wallet, module: "ctacte" },
  { href: "/sistema-tgs/ordenes", label: "Órdenes de trabajo", desc: "Taller y seguimiento", icon: ClipboardList, module: "ordenes" },
  { href: "/sistema-tgs/rma", label: "RMA", desc: "Garantías en recepción", icon: RotateCcw, module: "rma" },
];

export default function SistemaTgsHomePage() {
  const [me, setMe] = useState<TgsMe | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    tgsApi
      .me()
      .then((res) => setMe(res.data))
      .catch(setError);
  }, []);

  return (
    <TgsPage title="SISTEMA TGS" subtitle="Gestión de The Gamer Shop vía AcuStock">
      {error ? (
        <TgsError err={error} fallback="No se pudo hablar con AcuStock" />
      ) : !me ? (
        <TgsLoading />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Info label="Tenant" value={me.tenant} />
            <Info label="Clave" value={me.key_name} />
            <Info label="Local" value={String(me.local_id)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TGS_MODULES.map((mod) => (
              <TgsBadge key={mod} tone={tgsScopeClass(me.scopes[mod])}>
                {mod} · {tgsScopeLabel(me.scopes[mod])}
              </TgsBadge>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CARDS.map((card) => {
              const Icon = card.icon;
              const level = me.scopes[card.module];
              const off = level === "off";
              return (
                <Link
                  key={card.href}
                  href={off ? "/sistema-tgs" : card.href}
                  className={`border border-surface-800 rounded-xl p-4 flex gap-3 transition-colors ${
                    off ? "opacity-40 pointer-events-none" : "hover:border-brand-500/40 hover:bg-surface-900"
                  }`}
                >
                  <Icon className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{card.label}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{card.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
          {!me.modules.length && <TgsEmpty text="Esta clave no tiene módulos habilitados" />}
        </>
      )}
    </TgsPage>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-surface-500 font-medium">{label}</p>
      <p className="text-sm text-white mt-1 truncate" title={value}>
        {value}
      </p>
    </div>
  );
}
