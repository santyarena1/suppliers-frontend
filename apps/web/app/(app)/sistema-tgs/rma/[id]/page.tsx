"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsBadge from "@/components/tgs/TgsBadge";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsButton, TgsError, TgsField, TgsLoading } from "@/components/tgs/TgsUi";
import { dash } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsRma } from "@/lib/tgs-api";
import { RMA_PATCH_FIELDS } from "@/lib/tgs-forms";

const HIDDEN = new Set(["id"]);

export default function TgsRmaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [rma, setRma] = useState<TgsRma | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    tgsApi
      .rmaOne(id)
      .then((res) => setRma(res.data))
      .catch(setError);
  }, [id]);

  const extra = rma
    ? Object.entries(rma).filter(([key, value]) => {
        if (HIDDEN.has(key)) return false;
        if (value == null || value === "") return false;
        if (typeof value === "object") return false;
        return true;
      })
    : [];

  return (
    <TgsPage
      title={rma ? dash(rma.numero) !== "—" ? String(rma.numero) : `RMA #${rma.id}` : "RMA"}
      action={rma && <TgsButton onClick={() => setEditing((v) => !v)}>{editing ? "Cerrar" : "Editar"}</TgsButton>}
    >
      <Link href="/sistema-tgs/rma" className="text-xs text-surface-500 hover:text-white w-fit">
        ← RMA
      </Link>
      <TgsError err={error} fallback="RMA no encontrado" />
      {!error && !rma && <TgsLoading />}
      {rma && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-900 border border-surface-800 rounded-xl p-4">
          {extra.map(([key, value]) => (
            <TgsField key={key} label={key.replace(/_/g, " ")}>
              {key === "estado" ? (
                <TgsBadge>{String(value)}</TgsBadge>
              ) : key === "cliente_id" ? (
                <Link href={`/sistema-tgs/clientes/${value}`} className="text-brand-400 hover:text-brand-300">
                  {String(value)}
                </Link>
              ) : key === "venta_id" ? (
                <Link href={`/sistema-tgs/ventas/${value}`} className="text-brand-400 hover:text-brand-300">
                  {String(value)}
                </Link>
              ) : key === "orden_trabajo_id" ? (
                <Link href={`/sistema-tgs/ordenes/${value}`} className="text-brand-400 hover:text-brand-300">
                  {String(value)}
                </Link>
              ) : (
                String(value)
              )}
            </TgsField>
          ))}
        </div>
      )}
      {editing && rma && (
        <TgsEntityForm
          fields={RMA_PATCH_FIELDS}
          initial={rma as unknown as Record<string, unknown>}
          submitLabel="Guardar RMA"
          onSubmit={async (body) => {
            const res = await tgsApi.patchRma(id, body);
            setRma(res.data);
            setEditing(false);
          }}
        />
      )}
    </TgsPage>
  );
}
