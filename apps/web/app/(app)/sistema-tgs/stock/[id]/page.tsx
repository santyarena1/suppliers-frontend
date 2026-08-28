"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsStockEditModal from "@/components/tgs/TgsStockEditModal";
import { TgsButton, TgsError, TgsField, TgsLoading } from "@/components/tgs/TgsUi";
import { dash, tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsStockItem } from "@/lib/tgs-api";

export default function TgsStockDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const [item, setItem] = useState<TgsStockItem | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    tgsApi
      .stockOne(id)
      .then((res) => setItem(res.data))
      .catch(setError);
  }, [id]);

  return (
    <TgsPage
      title={item?.nombre ?? "Producto"}
      subtitle={item ? `SKU ${item.sku}` : undefined}
      action={
        item && (
          <TgsButton onClick={() => setEditing(true)}>Editar</TgsButton>
        )
      }
    >
      <Link href="/sistema-tgs/stock" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Stock
      </Link>
      {error && <TgsError err={error} fallback="Producto no encontrado" />}
      {!error && !item && <TgsLoading />}
      {item && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-900 border border-surface-800 rounded-xl p-4">
          <TgsField label="SKU">{item.sku}</TgsField>
          <TgsField label="Tipo">{dash(item.tipo)}</TgsField>
          <TgsField label="Categoría">{dash(item.categoria)}</TgsField>
          <TgsField label="Marca">{dash(item.marca)}</TgsField>
          <TgsField label="Depósito">{item.stock_deposito}</TgsField>
          <TgsField label="Catálogo">{item.stock_catalogo}</TgsField>
          <TgsField label="Comprometido">{item.comprometido}</TgsField>
          <TgsField label="Disponible">{item.disponible}</TgsField>
          <TgsField label="Precio">
            {tgsMoney(item.precio, item.moneda)}
            {item.precio_manual ? " (manual)" : ""}
          </TgsField>
        </div>
      )}
      {editing && item && (
        <TgsStockEditModal
          item={item}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setItem(next);
            setEditing(false);
          }}
        />
      )}
    </TgsPage>
  );
}
