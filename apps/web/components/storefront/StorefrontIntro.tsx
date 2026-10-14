"use client";

import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Search, Store } from "lucide-react";
import UpsellNotice from "@/components/subscription/UpsellNotice";
import { storefrontApi, type MyStorefront } from "@/lib/api";
import { apiError } from "@/lib/storefront";

const inputCls =
  "w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";

const STEPS = [
  { icon: FileSpreadsheet, title: "Publicá tu stock", body: "Subí tu planilla tal cual la tenés o cargá productos a mano. Marcas propias incluidas." },
  { icon: Search, title: "Te encuentran", body: "Los comercios de NODO te ven en el buscador como un proveedor más, marcado como local." },
  { icon: CheckCircle2, title: "Confirmás y listo", body: "Te llega el pedido, lo confirmás o lo rechazás y coordinan pago y entrega entre ustedes." },
];

/** Vender en NODO antes de abrir la tienda: qué es, y abrirla. */
export default function StorefrontIntro({
  allowed,
  orgName,
  defaultPhone,
  onOpened,
}: {
  allowed: boolean;
  orgName: string;
  defaultPhone: string | null;
  onOpened: (next: MyStorefront) => void;
}) {
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setOpening(true);
    setError(null);
    try {
      const res = await storefrontApi.open({ contactPhone: phone.trim() || null, contactNote: note.trim() || null });
      onOpened(res.data);
    } catch (err) {
      setError(apiError(err, "No se pudo abrir la tienda"));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-surface-800 bg-gradient-to-br from-emerald-600/10 via-surface-900 to-surface-900 p-6">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-white">Vendé tu stock a los demás comercios de NODO</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-surface-300">
          Lo que te sobra, lo que no rota, usados o importación propia. Lo publicás y los comercios que buscan en NODO lo
          encuentran al lado de los distribuidores. Sin comisión: NODO solo los conecta.
        </p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-surface-800 bg-surface-950/40 p-4">
              <s.icon className="h-4 w-4 text-emerald-300" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-white">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-surface-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {allowed ? (
        <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
          <h3 className="text-sm font-semibold text-white">Abrí tu tienda</h3>
          <p className="mt-1 text-xs text-surface-400">
            Vas a aparecer como <span className="font-semibold text-surface-200">{orgName}</span>. Después cargás los productos;
            hasta que no haya productos con stock, nadie la ve.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11px] text-surface-400">
              Teléfono / WhatsApp para los pedidos
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="11 5555-5555" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-surface-400">
              Zona, retiro y horarios (opcional)
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Retiro en Palermo, de 10 a 18" className={inputCls} />
            </label>
          </div>
          {error && <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
          <button
            type="button"
            onClick={() => void open()}
            disabled={opening}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
            Abrir mi tienda
          </button>
        </section>
      ) : (
        <UpsellNotice capability="storefront" />
      )}
    </div>
  );
}
