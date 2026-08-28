"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import TgsPage from "@/components/tgs/TgsPage";
import { TgsButton, TgsInput } from "@/components/tgs/TgsUi";
import { tgsErr } from "@/components/tgs/tgs-format";
import { tgsApi } from "@/lib/tgs-api";

export default function TgsNuevoRmaPage() {
  return (
    <Suspense fallback={<TgsPage title="Nuevo RMA"><p className="text-sm text-surface-500">Cargando…</p></TgsPage>}>
      <TgsNuevoRmaInner />
    </Suspense>
  );
}

function TgsNuevoRmaInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [falla, setFalla] = useState("");
  const [producto, setProducto] = useState("");
  const [serie, setSerie] = useState("");
  const [clienteId, setClienteId] = useState(search.get("cliente_id") ?? "");
  const [ventaId, setVentaId] = useState(search.get("venta_id") ?? "");
  const [ventaNumero, setVentaNumero] = useState("");
  const [ordenId, setOrdenId] = useState(search.get("orden_trabajo_id") ?? "");
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAviso(null);
    const body = {
      falla_reportada: falla.trim(),
      ...(producto.trim() ? { producto_nombre: producto.trim() } : {}),
      ...(serie.trim() ? { producto_serie: serie.trim() } : {}),
      ...(clienteId ? { cliente_id: Number(clienteId) } : {}),
      ...(ventaId ? { venta_id: Number(ventaId) } : {}),
      ...(ventaNumero.trim() ? { venta_numero: ventaNumero.trim() } : {}),
      ...(ordenId ? { orden_trabajo_id: Number(ordenId) } : {}),
    };
    try {
      const res = await tgsApi.createRma(body);
      const id = res.data?.id;
      router.push(id != null ? `/sistema-tgs/rma/${id}` : "/sistema-tgs/rma");
    } catch (err) {
      setAviso(tgsErr(err, "No se pudo crear el RMA"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <TgsPage title="Nuevo RMA" subtitle="Entra directo a recepción">
      <Link href="/sistema-tgs/rma" className="text-xs text-surface-500 hover:text-white w-fit">
        ← RMA
      </Link>
      <form onSubmit={submit} className="max-w-lg flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Falla reportada
          <textarea
            required
            value={falla}
            onChange={(e) => setFalla(e.target.value)}
            rows={3}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Producto
          <TgsInput value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Notebook Lenovo" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Serie
          <TgsInput value={serie} onChange={(e) => setSerie(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-surface-400">
            Cliente id
            <TgsInput value={clienteId} onChange={(e) => setClienteId(e.target.value)} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-surface-400">
            Venta id
            <TgsInput value={ventaId} onChange={(e) => setVentaId(e.target.value)} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-surface-400">
            N° de venta
            <TgsInput value={ventaNumero} onChange={(e) => setVentaNumero(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-surface-400">
            Orden de trabajo id
            <TgsInput value={ordenId} onChange={(e) => setOrdenId(e.target.value)} inputMode="numeric" />
          </label>
        </div>
        <p className="text-[11px] text-surface-500">
          Alcance con el producto, o con una venta / orden de trabajo. Con escritura en RMA se crea el caso en recepción.
        </p>
        {aviso && <p className="text-xs text-red-400">{aviso}</p>}
        <div className="flex justify-end">
          <TgsButton type="submit" disabled={saving || !falla.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Crear caso
          </TgsButton>
        </div>
      </form>
    </TgsPage>
  );
}
