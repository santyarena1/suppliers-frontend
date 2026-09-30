"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Search, Store } from "lucide-react";
import { getTenant, getUser } from "@/lib/auth";
import { ownStoreApi, type OwnRetailStoreOption } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { ownStoreConnectMessage, ownStoreWhatsappUrl } from "@/lib/own-store-compare";
import { publishOwnStore, useOwnStore } from "@/lib/own-store";

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export default function OwnStoreSettings({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const tenant = getTenant();
  const own = useOwnStore();
  const [mounted, setMounted] = useState(false);
  const [options, setOptions] = useState<OwnRetailStoreOption[] | null>(null);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [localName, setLocalName] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (tenant?.type !== "RETAILER") return;
    let cancel = false;
    ownStoreApi
      .options()
      .then((res) => {
        if (!cancel) setOptions(res.data ?? []);
      })
      .catch(() => {
        if (!cancel) setLoadError("No se pudo cargar la lista de locales.");
      });
    return () => {
      cancel = true;
    };
  }, [tenant?.type]);

  const filtered = useMemo(() => {
    const list = options ?? [];
    const q = fold(query.trim());
    const matched = q ? list.filter((store) => fold(store.name).includes(q)) : list;
    const selectedId = own.store?.id;
    return [...matched].sort((a, b) => {
      if (a.id === selectedId) return -1;
      if (b.id === selectedId) return 1;
      return a.name.localeCompare(b.name, "es");
    });
  }, [options, query, own.store?.id]);

  if (!mounted || tenant?.type !== "RETAILER") return null;

  async function choose(retailStoreId: string | null) {
    if (!own.canEdit || savingId) return;
    setSavingId(retailStoreId ?? "clear");
    try {
      const res = await ownStoreApi.set(retailStoreId);
      publishOwnStore(res.data);
      showToast(retailStoreId ? "Listo: esa es tu tienda" : "Quitamos la tienda propia");
    } catch {
      showToast("No se pudo guardar la tienda", false);
    } finally {
      setSavingId(null);
    }
  }

  const user = getUser();
  const requestReady = localName.trim().length >= 2;
  const whatsappHref = requestReady
    ? ownStoreWhatsappUrl(
        ownStoreConnectMessage({
          username: user?.username || "un comercio",
          orgName: tenant.name,
          email: user?.email,
          storeName: localName,
          website,
        })
      )
    : undefined;

  return (
    <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Store className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Tu tienda web</h2>
      </div>
      <p className="text-xs text-surface-500 mb-4 leading-relaxed">
        Elegí cuál de los locales que ya sincronizamos es el tuyo. En el buscador y en la ficha vas
        a ver la diferencia entre tu costo final y el precio de venta de esa web.
      </p>

      {own.store && (
        <p className="text-xs text-emerald-300 mb-3">
          Hoy comparás contra <span className="font-semibold">{own.store.name}</span>
          {own.canEdit && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => void choose(null)}
                disabled={savingId != null}
                className="underline underline-offset-2 hover:text-emerald-200 disabled:opacity-50"
              >
                Quitar
              </button>
            </>
          )}
        </p>
      )}

      {!own.canEdit && own.loaded && (
        <p className="text-[11px] text-surface-500 mb-3 leading-relaxed">
          Solo quien configura proveedores puede cambiar el local. El resto del equipo igual ve la
          comparación.
        </p>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar local"
          className="w-full bg-surface-950 border border-surface-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {loadError && <p className="text-xs text-red-300 mb-3">{loadError}</p>}
      {options == null && !loadError && <p className="text-xs text-surface-500">Cargando locales…</p>}
      {options != null && filtered.length === 0 && (
        <p className="text-xs text-surface-500 mb-2">Ningún local coincide con esa búsqueda.</p>
      )}

      {filtered.length > 0 && (
        <ul className="max-h-80 overflow-y-auto flex flex-col gap-1.5 pr-1">
          {filtered.map((store) => {
            const selected = own.store?.id === store.id;
            const busy = savingId === store.id;
            return (
              <li key={store.id}>
                <button
                  type="button"
                  disabled={!own.canEdit || savingId != null}
                  onClick={() => void choose(store.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-default ${
                    selected
                      ? "border-brand-500 bg-brand-600/10"
                      : "border-surface-700 bg-surface-800/40 hover:border-surface-600 disabled:hover:border-surface-700"
                  }`}
                >
                  <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {store.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(store.logoUrl, { trim: false })} alt="" className="w-full h-full object-contain p-0.5" />
                    ) : (
                      <Store className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-white truncate">{store.name}</span>
                    <span className="block text-[10px] text-surface-500">
                      {store.productCount.toLocaleString("es-AR")} productos
                      {busy ? " · guardando…" : ""}
                    </span>
                  </span>
                  {selected && <Check className="w-4 h-4 text-brand-300 flex-shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 pt-4 border-t border-surface-800">
        <h3 className="text-xs font-semibold text-white mb-1">¿Tu local no está en la lista?</h3>
        <p className="text-[11px] text-surface-500 leading-relaxed mb-3">
          La conexión es gratis. Dejá el nombre y, si lo tenés, el sitio. Se abre WhatsApp con el
          pedido armado para sincronizarlo.
        </p>
        <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">
          Nombre del local
        </label>
        <input
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="Ej. Mi Computación"
          className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 mb-3"
        />
        <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">
          Sitio web (opcional)
        </label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://"
          className="w-full bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 mb-3"
        />
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!requestReady}
          onClick={(event) => {
            if (!requestReady) event.preventDefault();
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            requestReady
              ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              : "bg-surface-800 text-surface-500 pointer-events-none"
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Pedir conexión gratis
        </a>
      </div>
    </section>
  );
}
