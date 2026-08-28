"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsItemsTable } from "@/components/tgs/TgsShared";
import { TgsError, TgsField, TgsLoading } from "@/components/tgs/TgsUi";
import { dash, tgsFecha, tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsCompra } from "@/lib/tgs-api";

export default function TgsCompraDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [compra, setCompra] = useState<TgsCompra | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    tgsApi
      .compra(id)
      .then((res) => setCompra(res.data))
      .catch(setError);
  }, [id]);

  return (
    <TgsPage title={compra?.numero ?? "Compra"} subtitle={compra ? tgsFecha(compra.fecha_emision) : undefined}>
      <Link href="/sistema-tgs/compras" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Compras
      </Link>
      {error && <TgsError err={error} fallback="Compra no encontrada" />}
      {!error && !compra && <TgsLoading />}
      {compra && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-900 border border-surface-800 rounded-xl p-4">
            <TgsField label="Estado">
              <TgsBadge>{compra.estado}</TgsBadge>
            </TgsField>
            <TgsField label="Proveedor">
              {compra.proveedor_id ? (
                <Link href={`/sistema-tgs/ctacte?tipo=proveedor&id=${compra.proveedor_id}`} className="text-brand-400 hover:text-brand-300">
                  {dash(compra.proveedor)}
                </Link>
              ) : (
                dash(compra.proveedor)
              )}
            </TgsField>
            <TgsField label="Moneda">{dash(compra.moneda)}</TgsField>
            <TgsField label="Total">{tgsMoney(compra.total, compra.moneda)}</TgsField>
            <TgsField label="Total ARS">{tgsMoney(compra.total_ars)}</TgsField>
          </div>
          <h2 className="text-sm font-semibold text-white">Ítems</h2>
          <TgsItemsTable items={compra.items} moneda={compra.moneda} />
        </>
      )}
    </TgsPage>
  );
}
