"use client";

import Link from "next/link";
import TgsPager from "./TgsPager";
import TgsBadge from "./TgsBadge";
import { TgsEmpty, TgsField } from "./TgsUi";
import { dash, tgsFecha, tgsMoney } from "./tgs-format";
import type { TgsCuentaCorriente, TgsLinea, TgsPageMeta } from "@/lib/tgs-api";

export function TgsItemsTable({ items, moneda }: { items: TgsLinea[] | undefined; moneda?: string | null }) {
  if (!items?.length) return <TgsEmpty text="Esta operación no trae ítems" />;
  return (
    <div className="overflow-x-auto border border-surface-800 rounded-xl">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
          <tr>
            <th className="text-left font-medium px-3 py-2">Producto</th>
            <th className="text-right font-medium px-3 py-2">Cant.</th>
            <th className="text-right font-medium px-3 py-2">Unitario</th>
            <th className="text-right font-medium px-3 py-2">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {items.map((line) => (
            <tr key={line.id} className="text-surface-200">
              <td className="px-3 py-2">{line.descripcion}</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.cantidad}</td>
              <td className="px-3 py-2 text-right tabular-nums">{tgsMoney(line.precio_unitario, moneda)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-white">{tgsMoney(line.subtotal, moneda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TgsCtaCteView({
  account,
  onPage,
}: {
  account: TgsCuentaCorriente;
  onPage?: (page: number) => void;
}) {
  const meta: TgsPageMeta | undefined = account.meta;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TgsField label="Cuenta">{account.nombre}</TgsField>
        <TgsField label="Tipo">{account.tipo}</TgsField>
        <TgsField label="Id">{account.id}</TgsField>
        <TgsField label="Saldo">{tgsMoney(account.saldo)}</TgsField>
      </div>
      {!account.movimientos?.length ? (
        <TgsEmpty text="Sin movimientos" />
      ) : (
        <div className="overflow-x-auto border border-surface-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">Concepto</th>
                <th className="text-left font-medium px-3 py-2">Tipo</th>
                <th className="text-right font-medium px-3 py-2">Monto</th>
                <th className="text-right font-medium px-3 py-2">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {account.movimientos.map((mov) => (
                <tr key={mov.id}>
                  <td className="px-3 py-2 text-surface-400 whitespace-nowrap">{tgsFecha(mov.fecha)}</td>
                  <td className="px-3 py-2 text-surface-200">
                    {dash(mov.concepto)}
                    {mov.referencia_tipo === "venta" && mov.referencia_id != null && (
                      <Link href={`/sistema-tgs/ventas/${mov.referencia_id}`} className="ml-2 text-brand-400 hover:text-brand-300 text-xs">
                        ver
                      </Link>
                    )}
                    {mov.referencia_tipo === "compra" && mov.referencia_id != null && (
                      <Link href={`/sistema-tgs/compras/${mov.referencia_id}`} className="ml-2 text-brand-400 hover:text-brand-300 text-xs">
                        ver
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <TgsBadge>{mov.tipo}</TgsBadge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-white">{tgsMoney(mov.monto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-surface-300">{tgsMoney(mov.saldo_nuevo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && onPage && <TgsPager meta={meta} onPage={onPage} />}
    </div>
  );
}
