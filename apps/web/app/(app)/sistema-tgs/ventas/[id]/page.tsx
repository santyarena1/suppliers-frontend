"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsItemsTable, TgsRecordGrid } from "@/components/tgs/TgsShared";
import { TgsButton, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsFecha } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsVenta } from "@/lib/tgs-api";
import { VENTA_FIELDS } from "@/lib/tgs-forms";

export default function TgsVentaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [venta, setVenta] = useState<TgsVenta | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    tgsApi
      .venta(id)
      .then((res) => setVenta(res.data))
      .catch(setError);
  }, [id]);

  return (
    <TgsPage
      title={venta?.numero ?? "Venta"}
      subtitle={venta ? tgsFecha(venta.fecha_emision) : undefined}
      wide
      action={
        venta && (
          <div className="flex gap-2">
            <TgsButton tone="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cerrar" : "Editar"}
            </TgsButton>
            <TgsButton onClick={() => router.push(`/sistema-tgs/rma/nuevo?venta_id=${venta.id}`)}>
              Crear RMA
            </TgsButton>
          </div>
        )
      }
    >
      <Link href="/sistema-tgs/ventas" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Ventas
      </Link>
      <TgsError err={error} fallback="Venta no encontrada" />
      {!error && !venta && <TgsLoading />}
      {venta && (
        <>
          <TgsRecordGrid record={venta as unknown as Record<string, unknown>} />
          <h2 className="text-sm font-semibold text-white">Ítems</h2>
          <TgsItemsTable items={venta.items} moneda={typeof venta.moneda === "string" ? venta.moneda : undefined} />
          {editing && (
            <TgsEntityForm
              fields={VENTA_FIELDS}
              initial={venta as unknown as Record<string, unknown>}
              withLines
              submitLabel="Guardar venta"
              onSubmit={async (body) => {
                const res = await tgsApi.patchVenta(id, body);
                setVenta(res.data);
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </TgsPage>
  );
}
