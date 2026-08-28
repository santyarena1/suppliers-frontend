"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import { TgsCtaCteView } from "@/components/tgs/TgsShared";
import { TgsButton, TgsError, TgsInput, TgsLoading, TgsSelect } from "@/components/tgs/TgsUi";
import { tgsApi, type TgsCuentaCorriente } from "@/lib/tgs-api";

export default function TgsCtaCtePage() {
  return (
    <Suspense fallback={<TgsPage title="Cuenta corriente"><TgsLoading /></TgsPage>}>
      <TgsCtaCteInner />
    </Suspense>
  );
}

function TgsCtaCteInner() {
  const search = useSearchParams();
  const [tipo, setTipo] = useState<"cliente" | "proveedor">(
    search.get("tipo") === "proveedor" ? "proveedor" : "cliente"
  );
  const [id, setId] = useState(search.get("id") ?? "");
  const [applied, setApplied] = useState<{ tipo: "cliente" | "proveedor"; id: string } | null>(
    search.get("id") ? { tipo: search.get("tipo") === "proveedor" ? "proveedor" : "cliente", id: search.get("id")! } : null
  );
  const [page, setPage] = useState(1);
  const [account, setAccount] = useState<TgsCuentaCorriente | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!applied?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res =
        applied.tipo === "proveedor"
          ? await tgsApi.ctacteProveedor(applied.id, { page, per_page: 50 })
          : await tgsApi.ctacteCliente(applied.id, { page, per_page: 50 });
      setAccount(res.data);
    } catch (err) {
      setError(err);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TgsPage title="Cuenta corriente" subtitle="Clientes y proveedores">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!id.trim()) return;
          setPage(1);
          setApplied({ tipo, id: id.trim() });
        }}
        className="flex flex-wrap gap-2"
      >
        <TgsSelect
          value={tipo}
          onChange={(e) => setTipo(e.target.value === "proveedor" ? "proveedor" : "cliente")}
          className="w-40"
        >
          <option value="cliente">Cliente</option>
          <option value="proveedor">Proveedor</option>
        </TgsSelect>
        <TgsInput
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Id numérico"
          inputMode="numeric"
          className="w-40"
        />
        <TgsButton type="submit">Consultar</TgsButton>
      </form>
      {error && <TgsError err={error} fallback="No se encontró la cuenta" />}
      {loading && <TgsLoading />}
      {!loading && account && <TgsCtaCteView account={account} onPage={setPage} />}
      {!loading && !account && !error && (
        <p className="text-sm text-surface-500">Ingresá el id de un cliente o proveedor para ver el saldo y los movimientos.</p>
      )}
    </TgsPage>
  );
}
