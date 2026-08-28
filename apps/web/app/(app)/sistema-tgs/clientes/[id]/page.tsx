"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import { TgsCtaCteView } from "@/components/tgs/TgsShared";
import TgsBadge from "@/components/tgs/TgsBadge";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { TgsButton, TgsError, TgsField, TgsLoading } from "@/components/tgs/TgsUi";
import { dash, tgsMoney } from "@/components/tgs/tgs-format";
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-900 border border-surface-800 rounded-xl p-4">
            <TgsField label="Nombre">{dash(cliente.nombre)} {dash(cliente.apellido)}</TgsField>
            <TgsField label="Razón social">{dash(cliente.razon_social)}</TgsField>
            <TgsField label="CUIT / DNI">{dash(cliente.cuit_dni)}</TgsField>
            <TgsField label="Email">{dash(cliente.email)}</TgsField>
            <TgsField label="Teléfono">{dash(cliente.telefono)}</TgsField>
            <TgsField label="IVA"><TgsBadge>{dash(cliente.tipo_iva)}</TgsBadge></TgsField>
            <TgsField label="Ciudad">{dash(cliente.ciudad)}</TgsField>
            <TgsField label="Provincia">{dash(cliente.provincia)}</TgsField>
            <TgsField label="Activo">{cliente.activo ? "Sí" : "No"}</TgsField>
            <TgsField label="Saldo">{tgsMoney(cliente.saldo_cuenta)}</TgsField>
            <TgsField label="Lista de precio">{dash(cliente.lista_precio_id)}</TgsField>
          </div>
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
