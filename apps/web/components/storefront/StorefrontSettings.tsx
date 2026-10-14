"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { storefrontApi, type MyStorefront } from "@/lib/api";
import { apiError } from "@/lib/storefront";

type StoreView = Extract<MyStorefront, { exists: true }>;

const inputCls =
  "w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";

/** Lo que ve el comprador para contactar a la tienda. */
export default function StorefrontSettings({ store, onChange }: { store: StoreView; onChange: (next: MyStorefront) => void }) {
  const [phone, setPhone] = useState(store.contactPhone ?? "");
  const [note, setNote] = useState(store.contactNote ?? "");
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setAviso(null);
    try {
      const res = await storefrontApi.update({ contactPhone: phone.trim() || null, contactNote: note.trim() || null });
      onChange(res.data);
      setAviso({ ok: true, text: "Guardado." });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo guardar") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
      <h2 className="text-sm font-semibold text-white">Datos de la tienda</h2>
      <p className="mt-1 text-xs leading-relaxed text-surface-400">
        En el buscador aparecés como <span className="font-semibold text-surface-200">{store.name}</span> (el nombre de tu
        comercio). Estos datos los ve quien te compra, para coordinar la entrega y el pago.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Teléfono / WhatsApp
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="11 5555-5555" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-surface-400">
          Zona, retiro y horarios
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Retiro en Palermo, lunes a viernes de 10 a 18. Envíos por moto en CABA."
            className={inputCls}
          />
        </label>
      </div>
      {aviso && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar
      </button>
    </section>
  );
}
