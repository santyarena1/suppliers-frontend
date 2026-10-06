"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Loader2, MessageCircle, Plus, Search, ShoppingBag, Tag, X } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import UpsellNotice from "@/components/subscription/UpsellNotice";
import QuoteEditor from "@/components/quotes/QuoteEditor";
import { getTenant } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import { quoteBadge, quoteError, quoteTitle, quotesApi, useQuoteTotal, useQuotes, type Quote } from "@/lib/quotes";

function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function QuotesPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-surface-500">Cargando…</div>}>
      <QuotesPageInner />
    </Suspense>
  );
}

/** Para qué sirve un presupuesto, en tres pasos. Se ve cuando no hay nada abierto. */
function HowItWorks({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  const steps = [
    { icon: Search, title: "Armalo", body: "Creá un presupuesto y sumá productos desde la búsqueda, la ficha o el comparador." },
    { icon: Tag, title: "Con precio de venta", body: "Cada producto va con tu precio de venta (costo + tu margen) y queda fijo." },
    { icon: MessageCircle, title: "Mandáselo al cliente", body: "Por WhatsApp, copiado o impreso. Si lo acepta, lo pasás al carrito y comprás." },
  ];
  return (
    <div className="mx-auto w-full max-w-md px-6 py-10 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/15 text-brand-300">
        <FileText className="h-6 w-6" />
      </span>
      <h2 className="text-base font-semibold text-white">Cotizá a tus clientes en minutos</h2>
      <p className="mt-1 text-sm text-surface-400">Un presupuesto es una lista de productos con tu precio de venta, lista para mandar.</p>
      <ol className="mt-6 space-y-3 text-left">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 rounded-xl border border-surface-800 bg-surface-900/60 p-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-800 text-surface-200">
              <s.icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">
                {i + 1}. {s.title}
              </span>
              <span className="block text-xs leading-relaxed text-surface-400">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
      >
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Nuevo presupuesto
      </button>
    </div>
  );
}

/** Presupuestos de venta: cada vendedor ve los suyos; dueño y admin, los de todo el equipo. */
function QuotesPageInner() {
  const quotes = useQuotes();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subscription } = useSubscription();
  const totalOf = useQuoteTotal();
  const tenant = getTenant();
  const seesAll = tenant?.role === "OWNER" || tenant?.role === "ADMIN";

  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [seller, setSeller] = useState<string>("all");
  const [list, setList] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("id"));
  const [creating, setCreating] = useState(false);

  // Abrir uno puntual desde la barra "Armando presupuesto" (/presupuestos?id=…).
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    if (!quotes.enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await quotesApi.list({ archived, q: debounced || undefined });
      setList(data);
    } catch (err) {
      setError(quoteError(err, "No se pudieron cargar los presupuestos"));
    } finally {
      setLoading(false);
    }
  }, [quotes.enabled, archived, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const sellers = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of list) map.set(q.createdById, q.mine ? "Yo" : q.createdByName ?? "Ex integrante");
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [list]);

  const shown = useMemo(() => (seller === "all" ? list : list.filter((q) => q.createdById === seller)), [list, seller]);
  const selected = shown.find((q) => q.id === selectedId) ?? null;

  function select(id: string | null) {
    setSelectedId(id);
    // La URL acompaña: volver atrás en el celular cierra el presupuesto.
    router.replace(id ? `/presupuestos?id=${encodeURIComponent(id)}` : "/presupuestos", { scroll: false });
  }

  function changed(q: Quote) {
    setList((prev) => {
      const stillHere = Boolean(q.archivedAt) === archived;
      const rest = prev.filter((x) => x.id !== q.id);
      return stillHere ? [q, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : rest;
    });
    if (Boolean(q.archivedAt) !== archived) select(null);
  }

  async function createNew() {
    setCreating(true);
    setError(null);
    try {
      const q = await quotes.create();
      if (!archived) setList((prev) => [q, ...prev]);
      else setArchived(false);
      select(q.id);
    } catch (err) {
      setError(quoteError(err, "No se pudo crear el presupuesto"));
    } finally {
      setCreating(false);
    }
  }

  /** Lo deja como el presupuesto que se está armando y lleva a la búsqueda. */
  function keepBuilding(q: Quote) {
    quotes.setActive(q.id);
    router.push("/search");
  }

  if (subscription && !quotes.enabled) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-4 text-base font-semibold text-white">Presupuestos</h1>
        <UpsellNotice capability="sellerMode" message="Los presupuestos para tus clientes son parte del modo vendedor, en NODO Pro." />
      </div>
    );
  }

  const nothingYet = !loading && !error && list.length === 0 && !archived && !debounced;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-surface-800 bg-surface-950 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white">Presupuestos</h1>
          <p className="hidden truncate text-xs text-surface-500 sm:block">
            Productos con tu precio de venta, listos para mandar al cliente
            {seesAll ? " · ves los de todo el equipo" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrefsPanel />
          <button
            type="button"
            onClick={createNew}
            disabled={creating}
            data-tour="quotes-new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Nuevo presupuesto
          </button>
        </div>
      </header>

      {nothingYet ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <HowItWorks onCreate={createNew} creating={creating} />
        </div>
      ) : (
        <>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-surface-800 px-4 py-2.5 sm:px-6">
            <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cliente, teléfono o #número"
                aria-label="Buscar presupuestos"
                className="w-full rounded-lg border border-surface-700 bg-surface-900 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <div className="flex rounded-lg border border-surface-700 p-0.5 text-xs" role="tablist">
              {[
                [false, "Abiertos"],
                [true, "Archivados"],
              ].map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  role="tab"
                  aria-selected={archived === value}
                  onClick={() => {
                    setArchived(value as boolean);
                    select(null);
                  }}
                  className={`rounded-md px-3 py-1 font-medium ${archived === value ? "bg-surface-700 text-white" : "text-surface-400 hover:text-white"}`}
                >
                  {label as string}
                </button>
              ))}
            </div>
            {seesAll && sellers.length > 1 && (
              <select
                value={seller}
                onChange={(e) => setSeller(e.target.value)}
                aria-label="Filtrar por vendedor"
                className="rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-1.5 text-xs text-surface-200 focus:border-brand-500 focus:outline-none"
              >
                <option value="all">Todo el equipo</option>
                {sellers.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex min-h-0 flex-1">
            <div className={`min-h-0 flex-1 overflow-y-auto lg:max-w-md lg:border-r lg:border-surface-800 ${selected ? "hidden lg:block" : ""}`}>
              {error && <p className="px-6 py-3 text-xs text-red-300">{error}</p>}
              {loading && list.length === 0 ? (
                <ul className="space-y-2 p-4 sm:px-6">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="h-16 animate-pulse rounded-xl bg-surface-900" />
                  ))}
                </ul>
              ) : shown.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <FileText className="mb-3 h-8 w-8 text-surface-700" />
                  <p className="text-sm text-surface-300">
                    {debounced ? "Ningún presupuesto coincide con la búsqueda." : archived ? "No hay presupuestos archivados." : "No hay presupuestos abiertos."}
                  </p>
                  {archived && (
                    <p className="mt-1 max-w-xs text-xs text-surface-500">Los que archivás quedan acá, por si el cliente vuelve.</p>
                  )}
                </div>
              ) : (
                <ul className="space-y-1.5 p-3 sm:px-4">
                  {shown.map((q) => {
                    const isSel = q.id === selectedId;
                    const building = quotes.active?.id === q.id;
                    return (
                      <li key={q.id}>
                        <button
                          type="button"
                          onClick={() => select(q.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            isSel ? "border-brand-500/60 bg-brand-500/10" : "border-surface-800 bg-surface-900/60 hover:border-surface-600"
                          }`}
                        >
                          <span
                            className={`flex h-9 min-w-[2.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                              building ? "bg-brand-600 text-white" : "bg-surface-800 text-surface-300"
                            }`}
                          >
                            {quoteBadge(q)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-white">{quoteTitle(q)}</span>
                              {building && (
                                <span className="flex-shrink-0 rounded-full bg-brand-500/15 px-1.5 py-px text-[10px] font-semibold text-brand-200">
                                  Armando
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-surface-500">
                              {q.itemCount === 0 ? "Sin productos" : `${q.itemCount} u.`} · {ago(q.updatedAt)}
                              {seesAll && !q.mine ? ` · ${q.createdByName ?? "Ex integrante"}` : ""}
                            </span>
                          </span>
                          <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-white">{totalOf(q)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className={`min-h-0 flex-1 overflow-y-auto ${selected ? "" : "hidden lg:flex lg:items-start lg:justify-center"}`}>
              {selected ? (
                <div className="mx-auto w-full max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2 border-b border-surface-800 px-3.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => select(null)}
                      className="rounded-md p-1 text-surface-400 hover:bg-surface-800 hover:text-white lg:hidden"
                      aria-label="Volver a la lista"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{quoteTitle(selected)}</p>
                      <p className="text-[11px] text-surface-500">
                        {selected.archivedAt ? "Archivado" : "Abierto"} · creado {ago(selected.createdAt)}
                        {seesAll && !selected.mine ? ` por ${selected.createdByName ?? "ex integrante"}` : ""}
                      </p>
                    </div>
                    {selected.mine && !selected.archivedAt &&
                      (quotes.active?.id === selected.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => router.push("/search")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                          >
                            <ShoppingBag className="h-3.5 w-3.5" /> Agregar productos
                          </button>
                          <button
                            type="button"
                            onClick={() => quotes.setActive(null)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-surface-400 hover:bg-surface-800 hover:text-white"
                            title="Deja de ser el presupuesto que estás armando. Queda guardado acá."
                          >
                            <X className="h-3.5 w-3.5" /> Terminar
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => keepBuilding(selected)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" /> Seguir armando
                        </button>
                      ))}
                  </div>
                  <QuoteEditor
                    quote={selected}
                    onChanged={changed}
                    onAddProducts={selected.mine && !selected.archivedAt ? () => keepBuilding(selected) : undefined}
                    onRemoved={(id) => {
                      setList((prev) => prev.filter((q) => q.id !== id));
                      select(null);
                    }}
                  />
                </div>
              ) : (
                <div className="px-6 pt-16 text-center">
                  <FileText className="mx-auto mb-3 h-8 w-8 text-surface-700" />
                  <p className="text-sm text-surface-400">Elegí un presupuesto para verlo, editarlo o mandarlo.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
