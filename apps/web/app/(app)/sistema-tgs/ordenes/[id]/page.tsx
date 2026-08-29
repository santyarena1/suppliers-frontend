"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsRecordGrid } from "@/components/tgs/TgsShared";
import { TgsButton, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsFecha } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsOrden } from "@/lib/tgs-api";
import { ORDEN_FIELDS } from "@/lib/tgs-forms";

export default function TgsOrdenDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [orden, setOrden] = useState<TgsOrden | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    tgsApi
      .orden(id)
      .then((res) => setOrden(res.data))
      .catch(setError);
  }, [id]);

  return (
    <TgsPage
      title={orden?.numero ?? "Orden"}
      subtitle={orden ? tgsFecha(orden.fecha_ingreso) : undefined}
      wide
      action={
        orden && (
          <div className="flex gap-2">
            <TgsButton tone="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cerrar" : "Editar"}
            </TgsButton>
            <TgsButton onClick={() => router.push(`/sistema-tgs/rma/nuevo?orden_trabajo_id=${orden.id}`)}>
              Crear RMA
            </TgsButton>
          </div>
        )
      }
    >
      <Link href="/sistema-tgs/ordenes" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Órdenes
      </Link>
      <TgsError err={error} fallback="Orden no encontrada" />
      {!error && !orden && <TgsLoading />}
      {orden && (
        <>
          <TgsRecordGrid record={orden as unknown as Record<string, unknown>} skip={["falla_reportada", "diagnostico", "solucion"]} />
          <div className="grid sm:grid-cols-3 gap-3">
            <Note title="Falla reportada" text={orden.falla_reportada} />
            <Note title="Diagnóstico" text={orden.diagnostico} />
            <Note title="Solución" text={orden.solucion} />
          </div>
          {editing && (
            <TgsEntityForm
              fields={ORDEN_FIELDS}
              initial={orden as unknown as Record<string, unknown>}
              submitLabel="Guardar orden"
              onSubmit={async (body) => {
                const res = await tgsApi.patchOrden(id, body);
                setOrden(res.data);
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </TgsPage>
  );
}

function Note({ title, text }: { title: string; text: string | null | undefined }) {
  return (
    <div className="border border-surface-800 rounded-xl p-3 bg-surface-900">
      <p className="text-[10px] uppercase tracking-wide text-surface-500">{title}</p>
      <p className="text-sm text-surface-200 mt-1 whitespace-pre-wrap">{text?.trim() || "—"}</p>
    </div>
  );
}
