"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsBadge from "@/components/tgs/TgsBadge";
import { TgsButton, TgsError, TgsField, TgsLoading } from "@/components/tgs/TgsUi";
import { dash, tgsFecha, tgsMoney } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsOrden } from "@/lib/tgs-api";

export default function TgsOrdenDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [orden, setOrden] = useState<TgsOrden | null>(null);
  const [error, setError] = useState<unknown>(null);

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
      action={
        orden && (
          <TgsButton onClick={() => router.push(`/sistema-tgs/rma/nuevo?orden_trabajo_id=${orden.id}`)}>
            Crear RMA
          </TgsButton>
        )
      }
    >
      <Link href="/sistema-tgs/ordenes" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Órdenes
      </Link>
      {error && <TgsError err={error} fallback="Orden no encontrada" />}
      {!error && !orden && <TgsLoading />}
      {orden && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-900 border border-surface-800 rounded-xl p-4">
            <TgsField label="Estado">
              <TgsBadge>{orden.estado}</TgsBadge>
            </TgsField>
            <TgsField label="Prioridad">{dash(orden.prioridad)}</TgsField>
            <TgsField label="Cliente">
              {orden.cliente_id ? (
                <Link href={`/sistema-tgs/clientes/${orden.cliente_id}`} className="text-brand-400 hover:text-brand-300">
                  {dash(orden.cliente)}
                </Link>
              ) : (
                dash(orden.cliente)
              )}
            </TgsField>
            <TgsField label="Equipo">
              {[orden.equipo_tipo, orden.equipo_marca, orden.equipo_modelo].filter(Boolean).join(" ") || "—"}
            </TgsField>
            <TgsField label="Serie">{dash(orden.equipo_serie)}</TgsField>
            <TgsField label="Garantía (días)">{dash(orden.garantia_dias)}</TgsField>
            <TgsField label="Presupuesto">{tgsMoney(orden.presupuesto_monto)}</TgsField>
            <TgsField label="Costo final">{tgsMoney(orden.costo_final)}</TgsField>
            <TgsField label="Completado">{tgsFecha(orden.fecha_completado)}</TgsField>
            <TgsField label="Entrega">{tgsFecha(orden.fecha_entrega)}</TgsField>
            <TgsField label="Seguimiento">
              {orden.tracking_url ? (
                <a href={orden.tracking_url} target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300">
                  Abrir
                </a>
              ) : (
                "—"
              )}
            </TgsField>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Note title="Falla reportada" text={orden.falla_reportada} />
            <Note title="Diagnóstico" text={orden.diagnostico} />
            <Note title="Solución" text={orden.solucion} />
          </div>
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
