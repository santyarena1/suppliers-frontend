"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import { TgsCtaCteView, TgsRecordGrid } from "@/components/tgs/TgsShared";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsButton, TgsError, TgsLoading } from "@/components/tgs/TgsUi";
import { tgsApi, type TgsCliente, type TgsCuentaCorriente } from "@/lib/tgs-api";
import { CLIENTE_FIELDS, CTACTE_FIELDS } from "@/lib/tgs-forms";

export default function TgsClienteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [cliente, setCliente] = useState<TgsCliente | null>(null);
  const [cta, setCta] = useState<TgsCuentaCorriente | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [mov, setMov] = useState(false);

  useEffect(() => {
    tgsApi
      .cliente(id)
      .then((res) => setCliente(res.data))
      .catch(setError);
  }, [id]);

  const loadCta = useCallback(async () => {
    try {
      const res = await tgsApi.ctacteCliente(id, { page, per_page: 50 });
      setCta(res.data);
    } catch {
      setCta(null);
    }
  }, [id, page]);

  useEffect(() => {
    loadCta();
  }, [loadCta]);

  return (
    <TgsPage
      title={cliente?.display_name ?? "Cliente"}
      subtitle={cliente ? `Nº ${cliente.id}` : undefined}
      wide
      action={
        cliente && (
          <TgsButton onClick={() => setEditing((v) => !v)}>{editing ? "Cerrar" : "Editar"}</TgsButton>
        )
      }
    >
      <Link href="/sistema-tgs/clientes" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Clientes
      </Link>
      <TgsError err={error} fallback="Cliente no encontrado" />
      {!error && !cliente && <TgsLoading />}
      {cliente && (
        <>
          <TgsRecordGrid record={cliente as unknown as Record<string, unknown>} />
          <h2 className="text-sm font-semibold text-white">Cuenta corriente</h2>
          {cta ? <TgsCtaCteView account={cta} onPage={setPage} /> : <p className="text-xs text-surface-500">Sin cuenta corriente</p>}
          <TgsButton tone="ghost" onClick={() => setMov((v) => !v)}>
            {mov ? "Cancelar movimiento" : "Nuevo movimiento"}
          </TgsButton>
          {mov && (
            <TgsEntityForm
              fields={CTACTE_FIELDS}
              submitLabel="Registrar"
              onSubmit={async (body) => {
                const res = await tgsApi.postCtaCliente(id, body);
                setCta(res.data);
                setMov(false);
              }}
            />
          )}
          {editing && (
            <TgsEntityForm
              fields={CLIENTE_FIELDS}
              initial={cliente as unknown as Record<string, unknown>}
              submitLabel="Guardar cliente"
              onSubmit={async (body) => {
                const res = await tgsApi.patchCliente(id, body);
                setCliente(res.data);
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </TgsPage>
  );
}
