"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { tgsApi, type TgsStockItem } from "@/lib/tgs-api";
import { TgsButton, TgsInput } from "./TgsUi";
import { tgsErr } from "./tgs-format";

interface Props {
  item: TgsStockItem;
  onClose: () => void;
  onSaved: (item: TgsStockItem) => void;
}

export default function TgsStockEditModal({ item, onClose, onSaved }: Props) {
  const [nombre, setNombre] = useState(item.nombre);
  const [precio, setPrecio] = useState(String(item.precio ?? ""));
  const [stock, setStock] = useState(String(item.stock_deposito ?? ""));
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    setAviso(null);
    const body: { nombre?: string; precio?: number; stock?: number } = {};
    if (nombre.trim() && nombre.trim() !== item.nombre) body.nombre = nombre.trim();
    const precioN = Number(precio.replace(",", "."));
    if (precio !== "" && Number.isFinite(precioN) && precioN !== item.precio) body.precio = precioN;
    const stockN = Number(stock.replace(",", "."));
    if (stock !== "" && Number.isFinite(stockN) && stockN !== item.stock_deposito) body.stock = stockN;
    if (Object.keys(body).length === 0) {
      onClose();
      setSaving(false);
      return;
    }
    try {
      const res = await tgsApi.patchStock(item.id, body);
      onSaved(res.data);
      onClose();
    } catch (err) {
      setAviso(tgsErr(err, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-surface-700 bg-surface-900 p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-sm font-semibold text-white">Editar producto</h2>
          <p className="text-[11px] text-surface-500 mt-0.5">
            SKU {item.sku} · el precio queda manual para que no lo pise el cálculo
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Nombre
          <TgsInput value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Precio
          <TgsInput value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          Stock de depósito
          <TgsInput value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" />
        </label>
        {aviso && <p className="text-xs text-red-400">{aviso}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <TgsButton tone="ghost" onClick={onClose}>
            Cancelar
          </TgsButton>
          <TgsButton onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Guardar
          </TgsButton>
        </div>
      </div>
    </div>
  );
}
