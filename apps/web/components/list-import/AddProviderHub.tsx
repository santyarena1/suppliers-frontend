"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, FileSpreadsheet, KeyRound, Loader2, Search, Send, Store, Ticket } from "lucide-react";
import ProviderBadge from "@/components/ProviderBadge";
import { StoreLogo } from "@/components/storefront/StoreProviderDetail";
import {
  invalidateMyProviders,
  loadMyProviders,
  myApi,
  storefrontApi,
  suppliersApi,
  type StorefrontInvitePreview,
  type StorefrontOffer,
  type VisibleProvider,
} from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { connectsByList } from "@/lib/providerDot";
import { apiError } from "@/lib/storefront";

/**
 * Primer paso de "Agregar proveedor" para un comercio: todo lo que puede sumar en
 * un solo lugar. Distribuidores que ya están en NODO, locales que venden en NODO
 * (tiendas públicas) y, con un código o un link, distribuidores y tiendas privadas.
 */
export default function AddProviderHub({
  onClose,
  onConnected,
  onLoadList,
  onRequest,
}: {
  onClose: () => void;
  onConnected?: () => void;
  /** Ninguno sirve: buscarlo para cargar su lista de precios. */
  onLoadList: (query: string) => void;
  /** Pedir que NODO integre un distribuidor que no está. */
  onRequest: (query: string) => void;
}) {
  const router = useRouter();
  const canManage = useCan("providers.manage");
  const [q, setQ] = useState("");
  const [providers, setProviders] = useState<VisibleProvider[] | null>(null);
  const [stores, setStores] = useState<StorefrontOffer[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadMyProviders()
      .then((list) => alive && setProviders(list.filter((p) => !p.linked && !p.storefront)))
      .catch(() => alive && setProviders([]));
    storefrontApi
      .offers()
      .then((r) => alive && setStores(r.data.filter((o) => o.audienceStatus !== "ACCEPTED")))
      .catch(() => alive && setStores([]));
    return () => {
      alive = false;
    };
  }, []);

  const needle = q.trim().toLowerCase();
  const shownProviders = useMemo(
    () =>
      (providers ?? [])
        .filter((p) => !needle || p.name.toLowerCase().includes(needle))
        .sort((a, b) => Number(connectsByList(a.provider)) - Number(connectsByList(b.provider)) || a.name.localeCompare(b.name, "es")),
    [providers, needle]
  );
  // Primero las que te propusieron y todavía no contestaste.
  const shownStores = useMemo(
    () =>
      (stores ?? [])
        .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.categories.some((c) => c.toLowerCase().includes(needle)))
        .sort((a, b) => Number(a.audienceStatus !== "PENDING") - Number(b.audienceStatus !== "PENDING") || a.name.localeCompare(b.name, "es")),
    [stores, needle]
  );

  function done(path?: string) {
    invalidateMyProviders();
    onConnected?.();
    onClose();
    if (path) router.push(path);
  }

  async function connectList(p: VisibleProvider) {
    setWorking(p.provider);
    setError(null);
    try {
      await suppliersApi.connectListByProvider(p.provider);
      done(`/proveedores/${encodeURIComponent(p.provider)}?tab=lists`);
    } catch (err) {
      setError(apiError(err, "No se pudo conectar"));
      setWorking(null);
    }
  }

  async function acceptStore(s: StorefrontOffer) {
    setWorking(s.storefrontId);
    setError(null);
    try {
      await storefrontApi.decide(s.storefrontId, "ACCEPT");
      done(`/proveedores/${encodeURIComponent(s.provider)}`);
    } catch (err) {
      setError(apiError(err, "No se pudo sumar la tienda"));
      setWorking(null);
    }
  }

  const loading = providers === null || stores === null;
  const nothing = !loading && shownProviders.length === 0 && shownStores.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar un distribuidor o un local…"
          aria-label="Buscar un distribuidor o un local"
          className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
        />
      </div>

      {error && <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
        </div>
      ) : (
        <>
          {shownProviders.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-surface-500 mb-2">
                Distribuidores en NODO — {shownProviders.length}
              </h3>
              <div className="border border-surface-800 rounded-xl divide-y divide-surface-800 max-h-56 overflow-y-auto">
                {shownProviders.map((p) => (
                  <div key={p.provider} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <ProviderBadge provider={p.provider} label={p.name} variant="inline" size="sm" />
                    </div>
                    {connectsByList(p.provider) ? (
                      <button
                        type="button"
                        onClick={() => void connectList(p)}
                        disabled={working !== null}
                        className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200 disabled:opacity-50"
                      >
                        {working === p.provider ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />} Cargar mi lista
                      </button>
                    ) : (
                      <Link
                        href={`/proveedores/${encodeURIComponent(p.provider)}?tab=credentials`}
                        onClick={onClose}
                        className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200"
                      >
                        <KeyRound className="w-3 h-3" /> Conectar mi cuenta
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {shownStores.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-surface-500 mb-1">
                Locales que venden en NODO — {shownStores.length}
              </h3>
              <p className="text-[11px] text-surface-500 mb-2">Usados, caja abierta, sobrantes. Se suman como un proveedor más.</p>
              <div className="border border-surface-800 rounded-xl divide-y divide-surface-800 max-h-56 overflow-y-auto">
                {shownStores.map((s) => (
                  <div key={s.storefrontId} className="flex items-center gap-3 px-3 py-2.5">
                    <StoreLogo offer={s} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-surface-100 truncate">{s.name}</p>
                      <p className="text-[11px] text-surface-500 truncate">
                        {s.productCount} {s.productCount === 1 ? "producto" : "productos"}
                        {s.categories.length ? ` · ${s.categories.slice(0, 2).join(", ")}` : ""}
                        {s.source === "INVITE" ? " · te invitó" : ""}
                      </p>
                    </div>
                    {canManage !== false ? (
                      <button
                        type="button"
                        onClick={() => void acceptStore(s)}
                        disabled={working !== null}
                        className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-md px-2.5 py-1.5"
                      >
                        {working === s.storefrontId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Sumar
                      </button>
                    ) : (
                      <span className="flex-shrink-0 text-[11px] text-surface-500">Lo decide quien maneja los proveedores</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {nothing && (
            <p className="text-xs text-surface-500 text-center py-2">
              {needle ? "Ningún distribuidor ni local se llama así." : "Ya sumaste a todos los distribuidores y locales disponibles."}
            </p>
          )}
        </>
      )}

      <CodeOrLink onDone={done} />

      <div className="flex flex-col gap-2 border-t border-surface-800 pt-3">
        <button
          type="button"
          onClick={() => onLoadList(q.trim())}
          className="text-left border border-surface-800 hover:border-brand-500 rounded-xl p-3 flex items-start gap-3 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-brand-700 dark:text-brand-400 mt-0.5" />
          <span>
            <span className="block text-sm font-semibold text-white">¿No está? Cargá su lista de precios</span>
            <span className="block text-xs text-surface-500 mt-0.5">Te la mandan por WhatsApp o mail. La subís vos y ves sus productos con tus precios.</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onRequest(q.trim())}
          className="text-left border border-dashed border-surface-700 hover:border-brand-500 rounded-xl p-3 flex items-start gap-3 transition-colors"
        >
          <Send className="w-4 h-4 text-brand-700 dark:text-brand-400 mt-0.5" />
          <span>
            <span className="block text-sm font-semibold text-white">Pedinos que integremos un distribuidor</span>
            <span className="block text-xs text-surface-500 mt-0.5">Catálogo, tus precios y pedidos desde NODO. Te escribimos para coordinar.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** Lo que pegó el comercio: un link de tienda (…/tienda/<token>), un código de acceso (XXXX-XXXX-XXXX) o el token suelto de una tienda. */
function parseCode(raw: string): { kind: "store"; token: string } | { kind: "code"; code: string } | null {
  const text = raw.trim();
  if (!text) return null;
  const link = text.match(/\/tienda\/([A-Za-z0-9_-]+)/);
  if (link) return { kind: "store", token: link[1] };
  if (/^[A-Za-z0-9]{4}[\s-]?[A-Za-z0-9]{4}[\s-]?[A-Za-z0-9]{4}$/.test(text)) return { kind: "code", code: text.toUpperCase() };
  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) return { kind: "store", token: text };
  return { kind: "code", code: text.toUpperCase() };
}

/** Un solo campo para el código de un distribuidor o marca y para el link de una tienda privada. */
function CodeOrLink({ onDone }: { onDone: (path?: string) => void }) {
  const canManage = useCan("providers.manage");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [store, setStore] = useState<{ token: string; preview: StorefrontInvitePreview } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCode(value);
    if (!parsed || sending) return;
    setSending(true);
    setError(null);
    setOk(null);
    setStore(null);
    try {
      if (parsed.kind === "code") {
        const res = await myApi.redeemCode(parsed.code);
        setOk(`Quedaste conectado con ${res.data.tenantName}`);
        setValue("");
        invalidateMyProviders();
        setTimeout(() => onDone(), 900);
      } else {
        const res = await storefrontApi.invite(parsed.token);
        setStore({ token: parsed.token, preview: res.data });
      }
    } catch (err) {
      setError(apiError(err, parsed.kind === "code" ? "No se pudo canjear el código" : "El link de invitación no existe o ya no vale"));
    } finally {
      setSending(false);
    }
  }

  async function enterStore() {
    if (!store) return;
    setSending(true);
    setError(null);
    try {
      await storefrontApi.acceptInvite(store.token);
      onDone(`/proveedores/${encodeURIComponent(store.preview.provider)}`);
    } catch (err) {
      setError(apiError(err, "No se pudo entrar a la tienda"));
      setSending(false);
    }
  }

  const p = store?.preview;
  const already = p?.audienceStatus === "ACCEPTED";

  return (
    <section className="border border-surface-800 rounded-xl p-3 flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-surface-500">Tengo un código o un link</h3>
      <p className="text-[11px] text-surface-500">
        El código de acceso de un distribuidor o una marca, o el link de la tienda privada de un local.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <Ticket className="w-4 h-4 text-surface-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="XXXX-XXXX-XXXX o nodo…/tienda/…"
            aria-label="Código de acceso o link de tienda"
            className="w-full bg-surface-900 border border-surface-700 focus:border-brand-500 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim() || sending}
          className="flex items-center justify-center gap-1.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 transition-all"
        >
          {sending && !store && <Loader2 className="w-4 h-4 animate-spin" />}
          Usar
        </button>
      </form>
      {error && <p className="text-xs text-red-400 bg-red-500/8 rounded-md px-3 py-2">{error}</p>}
      {ok && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/8 rounded-md px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" /> {ok}
        </p>
      )}
      {p && (
        <div className="flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-900 px-3 py-2.5">
          {p.logoUrl ? <StoreLogo offer={p} size="h-8 w-8" /> : <Store className="h-5 w-5 text-brand-300" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-surface-100 truncate">{p.name}</p>
            <p className="text-[11px] text-surface-500 truncate">
              {p.productCount} {p.productCount === 1 ? "producto" : "productos"}
              {p.categories.length ? ` · ${p.categories.slice(0, 2).join(", ")}` : ""}
            </p>
          </div>
          {p.own ? (
            <span className="text-[11px] text-surface-500">Es tu tienda</span>
          ) : already ? (
            <button type="button" onClick={() => onDone(`/proveedores/${encodeURIComponent(p.provider)}`)} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ya la ves · Ir
            </button>
          ) : !p.canAccept ? (
            <span className="text-[11px] text-surface-500">Las tiendas de locales son para comercios</span>
          ) : !p.open ? (
            <span className="text-[11px] text-amber-300">No está abierta ahora</span>
          ) : canManage !== false ? (
            <button
              type="button"
              onClick={() => void enterStore()}
              disabled={sending}
              className="flex items-center gap-1 text-[11px] font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-md px-2.5 py-1.5"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Sumar tienda
            </button>
          ) : (
            <span className="text-[11px] text-surface-500">Lo decide quien maneja los proveedores</span>
          )}
        </div>
      )}
    </section>
  );
}
