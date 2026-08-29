"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsRecordGrid } from "@/components/tgs/TgsShared";
import { TgsButton, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsApi, type TgsStockItem } from "@/lib/tgs-api";
import { STOCK_FIELDS } from "@/lib/tgs-forms";

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
      wide
      action={
        item && (
          <TgsButton onClick={() => setEditing((v) => !v)}>{editing ? "Cerrar" : "Editar"}</TgsButton>
        )
      }
    >
      <Link href="/sistema-tgs/stock" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Stock
      </Link>
      <TgsError err={error} fallback="Producto no encontrado" />
      {!error && !item && <TgsLoading />}
      {item && <TgsRecordGrid record={item as unknown as Record<string, unknown>} />}
      {editing && item && (
        <TgsEntityForm
          fields={STOCK_FIELDS}
          initial={item as unknown as Record<string, unknown>}
          submitLabel="Guardar producto"
          onSubmit={async (body) => {
            const res = await tgsApi.patchStock(item.id, body);
            setItem(res.data);
            setEditing(false);
          }}
        />
      )}
    </TgsPage>
  );
}
