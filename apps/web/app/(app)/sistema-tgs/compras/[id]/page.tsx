"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsItemsTable, TgsRecordGrid } from "@/components/tgs/TgsShared";
import { TgsButton, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsFecha } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsCompra } from "@/lib/tgs-api";
import { COMPRA_FIELDS } from "@/lib/tgs-forms";

export default function TgsCompraDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [compra, setCompra] = useState<TgsCompra | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    tgsApi
      .compra(id)
      .then((res) => setCompra(res.data))
      .catch(setError);
  }, [id]);

  return (
    <TgsPage
      title={compra?.numero ?? "Compra"}
      subtitle={compra ? tgsFecha(compra.fecha_emision) : undefined}
      wide
      action={
        compra && (
          <TgsButton onClick={() => setEditing((v) => !v)}>{editing ? "Cerrar" : "Editar"}</TgsButton>
        )
      }
    >
      <Link href="/sistema-tgs/compras" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Compras
      </Link>
      <TgsError err={error} fallback="Compra no encontrada" />
      {!error && !compra && <TgsLoading />}
      {compra && (
        <>
          <TgsRecordGrid record={compra as unknown as Record<string, unknown>} />
          <h2 className="text-sm font-semibold text-white">Ítems</h2>
          <TgsItemsTable items={compra.items} moneda={compra.moneda} />
          {editing && (
            <TgsEntityForm
              fields={COMPRA_FIELDS}
              initial={compra as unknown as Record<string, unknown>}
              withLines
              submitLabel="Guardar compra"
              onSubmit={async (body) => {
                const res = await tgsApi.patchCompra(id, body);
                setCompra(res.data);
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </TgsPage>
  );
}
