"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, FileText, Loader2, MessageCircle, Palette, Plus, Search, ShoppingBag, SlidersHorizontal, Tag, Cpu } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import UpsellNotice from "@/components/subscription/UpsellNotice";
import QuoteEditor from "@/components/quotes/QuoteEditor";
import QuotePdfPreview from "@/components/quotes/QuotePdfPreview";
import { useQuoteSettings } from "@/components/quotes/quote-share";
import { getTenant } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  quoteBadge,
  quoteCode,
  quoteError,
  quotesApi,
  useQuoteTotal,
  useQuotes,
  type Quote,
  type QuoteListPage,
  type QuoteSort,
  type QuoteStatus,
} from "@/lib/quotes";

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

/** Para qué sirve un presupuesto, en tres pasos. Se ve cuando todavía no hay ninguno. */
function HowItWorks({ onCreate, creating, canDesign }: { onCreate: () => void; creating: boolean; canDesign: boolean }) {
  const steps = [
    { icon: Search, title: "Armalo", body: "Creá uno y buscá los productos ahí mismo, o sumalos desde la búsqueda con «Presupuesto». También líneas libres: armado, envío." },
    { icon: Tag, title: "Con tu precio de venta", body: "Costo + tu margen. El margen sale de cada proveedor, o le ponés uno propio al presupuesto o a cada producto." },
    { icon: MessageCircle, title: "Mandalo", body: "PDF con tu logo y tus colores, WhatsApp o copiado. Si lo acepta, lo pasás al carrito y comprás." },
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
      {canDesign && (
        <Link href="/presupuestos/plantilla" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-surface-400 hover:text-white">
          <Palette className="h-3.5 w-3.5" /> Antes, armá la plantilla del PDF con tu logo
        </Link>
      )}
    </div>
  );
}

const STATUS_FILTERS: { value: "all" | QuoteStatus; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "DRAFT", label: "Borradores" },
  { value: "SENT", label: "Enviados" },
  { value: "ACCEPTED", label: "Aceptados" },
  { value: "REJECTED", label: "Rechazados" },
  { value: "EXPIRED", label: "Vencidos" },
];

const SORT_OPTIONS: { value: QuoteSort; label: string }[] = [
  { value: "updated", label: "Último cambio" },
  { value: "created", label: "Fecha de creación" },
  { value: "number", label: "Número" },
  { value: "validUntil", label: "Vencen primero" },
];

const PAGE_SIZE = 30;

/** "Ryzen 5 5600, Kingston Fury 16GB y 2 más": qué tiene sin abrirlo. */
function contentSummary(q: Quote): string {
  if (q.items.length === 0) return "";
  const names = q.items.slice(0, 2).map((it) => it.name.split(/\s+/).slice(0, 5).join(" "));
  const rest = q.items.length - names.length;
  return rest > 0 ? `${names.join(", ")} y ${rest} más` : names.join(" y ");
}

/** Presupuestos de venta: cada vendedor ve los suyos; dueño y admin, los de todo el equipo. */
function QuotesPageInner() {
  const quotes = useQuotes();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subscription } = useSubscription();
  const totalOf = useQuoteTotal();
  const settings = useQuoteSettings();
  const tenant = getTenant();
  const seesAll = tenant?.role === "OWNER" || tenant?.role === "ADMIN";

  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [seller, setSeller] = useState<string>("all");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<QuoteSort>("updated");
  const [moreFilters, setMoreFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<QuoteListPage["counts"] | null>(null);
  // Personas vistas en alguna página: el filtro por vendedor no depende de la página actual.
  const [sellers, setSellers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("id"));
  const [selectedExtra, setSelectedExtra] = useState<Quote | null>(null);
  const [preview, setPreview] = useState<Quote | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Abrir uno puntual desde la burbuja o la barra "Armando presupuesto" (/presupuestos?id=…).
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Cualquier filtro nuevo vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [archived, debounced, seller, status, from, to, sort]);

  const load = useCallback(async () => {
    if (!quotes.enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await quotesApi.list({
        archived,
        q: debounced || undefined,
        createdById: seller === "all" ? undefined : seller,
        status: status === "all" ? undefined : status,
        from: from || undefined,
        to: to || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      });
      setList(data.items);
      setTotal(data.total);
      setCounts(data.counts);
      setSellers((prev) => {
        const next = new Map(prev);
        for (const q of data.items) next.set(q.createdById, q.mine ? "Yo" : q.createdByName ?? "Ex integrante");
        return next;
      });
    } catch (err) {
      setError(quoteError(err, "No se pudieron cargar los presupuestos"));
    } finally {
      setLoading(false);
    }
  }, [quotes.enabled, archived, debounced, seller, status, from, to, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // El que se abre por link puede no estar en esta página: se trae aparte.
  useEffect(() => {
    if (!selectedId || list.some((q) => q.id === selectedId) || selectedExtra?.id === selectedId) return;
    let alive = true;
    quotesApi
      .get(selectedId)
      .then(({ data }) => alive && setSelectedExtra(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selectedId, list, selectedExtra?.id]);

  const sellerOptions = useMemo(() => [...sellers.entries()].sort((a, b) => a[1].localeCompare(b[1])), [sellers]);
  const selected = list.find((q) => q.id === selectedId) ?? (selectedExtra?.id === selectedId ? selectedExtra : null);
  const filtering = Boolean(debounced || from || to || status !== "all" || seller !== "all");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function select(id: string | null) {
    setSelectedId(id);
    // La URL acompaña: volver atrás en el celular cierra el presupuesto.
    router.replace(id ? `/presupuestos?id=${encodeURIComponent(id)}` : "/presupuestos", { scroll: false });
  }

  function changed(q: Quote) {
    if (selectedExtra?.id === q.id) setSelectedExtra(q);
    setList((prev) => {
      const stillHere = Boolean(q.archivedAt) === archived;
      return stillHere ? prev.map((x) => (x.id === q.id ? q : x)) : prev.filter((x) => x.id !== q.id);
    });
    if (Boolean(q.archivedAt) !== archived) {
      select(null);
      void load();
    }
  }

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setSeller("all");
    setFrom("");
    setTo("");
  }

  async function createNew() {
    setCreating(true);
    setError(null);
    try {
      const q = await quotes.create();
      if (archived) setArchived(false);
      clearFilters();
      setSort("updated");
      setList((prev) => [q, ...prev.filter((x) => x.id !== q.id)]);
      setTotal((t) => t + 1);
      setFreshId(q.id);
      select(q.id);
    } catch (err) {
      setError(quoteError(err, "No se pudo crear el presupuesto"));
    } finally {
      setCreating(false);
    }
  }

  /** Lo deja como el presupuesto al que va lo que se agrega desde la búsqueda. */
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

  const nothingYet = !loading && !error && counts?.ALL === 0 && !archived && !filtering;
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-surface-800 bg-surface-950 px-4 py-3 sm:gap-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white">Presupuestos</h1>
          <p className="hidden truncate text-xs text-surface-500 sm:block">
            Productos con tu precio de venta, listos para mandar en PDF o por WhatsApp
            {seesAll ? " · ves los de todo el equipo" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrefsPanel />
          {seesAll && (
            <Link
              href="/presupuestos/plantilla"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm font-medium text-surface-200 hover:border-surface-500 hover:text-white"
              title="Logo, colores, datos del comercio y condiciones del PDF"
            >
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Plantilla del PDF</span>
            </Link>
          )}
          <Link
            href="/presupuestos/armador"
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-sm font-medium text-surface-200 hover:border-surface-500 hover:text-white"
            title="Armá una PC con chequeo de compatibilidad y pasala a un presupuesto"
          >
            <Cpu className="h-4 w-4" />
            <span className="hidden sm:inline">Armar PC</span>
          </Link>
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
          <HowItWorks onCreate={createNew} creating={creating} canDesign={seesAll} />
        </div>
      ) : (
        <>
          <div className={`${selected ? "hidden lg:block" : "block"} flex-shrink-0 border-b border-surface-800 px-4 py-2.5 sm:px-6`}>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[12rem] flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre, cliente, teléfono, mail o número"
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
              <button
                type="button"
                onClick={() => setMoreFilters((v) => !v)}
                aria-expanded={moreFilters}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  moreFilters || from || to || seller !== "all" || sort !== "updated"
                    ? "border-brand-500/60 bg-brand-500/10 text-brand-200"
                    : "border-surface-700 text-surface-300 hover:text-white"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Fechas y orden
              </button>
            </div>

            {moreFilters && (
              <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
                <label className="flex flex-col gap-1 text-surface-400">
                  Creado desde
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-surface-200 focus:border-brand-500 focus:outline-none [color-scheme:dark]" />
                </label>
                <label className="flex flex-col gap-1 text-surface-400">
                  Hasta
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-surface-200 focus:border-brand-500 focus:outline-none [color-scheme:dark]" />
                </label>
                <label className="flex flex-col gap-1 text-surface-400">
                  Ordenar por
                  <select value={sort} onChange={(e) => setSort(e.target.value as QuoteSort)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-surface-200 focus:border-brand-500 focus:outline-none">
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {seesAll && sellerOptions.length > 1 && (
                  <label className="flex flex-col gap-1 text-surface-400">
                    Armado por
                    <select value={seller} onChange={(e) => setSeller(e.target.value)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-surface-200 focus:border-brand-500 focus:outline-none">
                      <option value="all">Todo el equipo</option>
                      {sellerOptions.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {filtering && (
                  <button type="button" onClick={clearFilters} className="px-1 py-1.5 font-medium text-surface-400 underline-offset-2 hover:text-white hover:underline">
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" aria-label="Filtrar por estado">
              {STATUS_FILTERS.filter((f) => f.value === "all" || status === f.value || (counts?.[f.value] ?? 0) > 0).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  aria-pressed={status === f.value}
                  className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    status === f.value ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-surface-700 text-surface-400 hover:text-white"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums opacity-70">{(counts?.[f.value === "all" ? "ALL" : f.value] ?? 0).toLocaleString("es-AR")}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className={`flex min-h-0 flex-1 flex-col lg:max-w-md lg:border-r lg:border-surface-800 ${selected ? "hidden lg:flex" : ""}`}>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {error && <p className="px-6 py-3 text-xs text-red-300">{error}</p>}
                {loading && list.length === 0 ? (
                  <ul className="space-y-2 p-4 sm:px-6">
                    {[0, 1, 2].map((i) => (
                      <li key={i} className="h-20 animate-pulse rounded-xl bg-surface-900" />
                    ))}
                  </ul>
                ) : list.length === 0 ? (
                  <div className="flex flex-col items-center px-6 py-16 text-center">
                    <FileText className="mb-3 h-8 w-8 text-surface-700" />
                    <p className="text-sm text-surface-300">
                      {filtering
                        ? "Ningún presupuesto coincide con los filtros."
                        : archived
                          ? "No hay presupuestos archivados."
                          : "No hay presupuestos abiertos."}
                    </p>
                    {filtering && (
                      <button type="button" onClick={clearFilters} className="mt-2 text-xs font-medium text-brand-300 hover:text-brand-200">
                        Limpiar filtros
                      </button>
                    )}
                    {archived && !filtering && <p className="mt-1 max-w-xs text-xs text-surface-500">Los que archivás quedan acá, por si el cliente vuelve.</p>}
                  </div>
                ) : (
                  <ul className={`space-y-1.5 p-3 transition-opacity sm:px-4 ${loading ? "opacity-60" : ""}`}>
                    {list.map((q) => {
                      const isSel = q.id === selectedId;
                      const building = quotes.active?.id === q.id;
                      const name = q.title || q.clientName || "Sin nombre ni cliente";
                      const summary = contentSummary(q);
                      return (
                        <li key={q.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => select(q.id)}
                            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 pr-11 text-left transition-colors ${
                              isSel ? "border-brand-500/60 bg-brand-500/10" : "border-surface-800 bg-surface-900/60 hover:border-surface-600"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-9 min-w-[2.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                                building ? "bg-brand-600 text-white" : "bg-surface-800 text-surface-300"
                              }`}
                            >
                              {quoteBadge(q)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className={`truncate text-sm font-medium ${q.title || q.clientName ? "text-white" : "text-surface-400"}`}>{name}</span>
                                <span className={`flex-shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold ${QUOTE_STATUS_TONE[q.status]}`}>
                                  {QUOTE_STATUS_LABEL[q.status]}
                                </span>
                                {q.atCostLines > 0 && (
                                  <span className="flex-shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold text-amber-300" title="Hay productos al costo">
                                    al costo
                                  </span>
                                )}
                              </span>
                              <span className="block truncate text-[11px] text-surface-500">
                                {quoteCode(settings?.numberPrefix, q.number)}
                                {q.title && q.clientName ? ` · ${q.clientName}` : ""} · {ago(q.updatedAt)}
                                {seesAll && !q.mine ? ` · ${q.createdByName ?? "Ex integrante"}` : ""}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-surface-400">
                                {summary ? `${q.itemCount} u. · ${summary}` : "Sin productos todavía"}
                              </span>
                            </span>
                            <span className="flex-shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-white">{totalOf(q)}</span>
                          </button>
                          {q.items.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPreview(q)}
                              className="absolute bottom-2 right-2 rounded-md p-1.5 text-surface-500 hover:bg-surface-800 hover:text-white"
                              title="Ver el PDF como le llega al cliente"
                              aria-label={`Ver el PDF de ${name}`}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {total > 0 && (
                <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-surface-800 px-4 py-2 text-[11px] text-surface-400">
                  <span className="tabular-nums">
                    {firstShown.toLocaleString("es-AR")}–{lastShown.toLocaleString("es-AR")} de {total.toLocaleString("es-AR")}
                  </span>
                  {pages > 1 && (
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="rounded-md p-1 hover:bg-surface-800 hover:text-white disabled:opacity-40" aria-label="Página anterior">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="tabular-nums">
                        Página {page} de {pages.toLocaleString("es-AR")}
                      </span>
                      <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading} className="rounded-md p-1 hover:bg-surface-800 hover:text-white disabled:opacity-40" aria-label="Página siguiente">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </div>
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
                      <p className="truncate text-sm font-semibold text-white">
                        {quoteCode(settings?.numberPrefix, selected.number)}
                        {selected.title || selected.clientName ? ` · ${selected.title || selected.clientName}` : ""}
                      </p>
                      <p className="text-[11px] text-surface-500">
                        {selected.archivedAt ? "Archivado · " : ""}creado {ago(selected.createdAt)}
                        {seesAll && !selected.mine ? ` por ${selected.createdByName ?? "ex integrante"}` : ""}
                      </p>
                    </div>
                    {selected.mine && !selected.archivedAt && (
                      <button
                        type="button"
                        onClick={() => keepBuilding(selected)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white"
                        title="Te lleva a la búsqueda: lo que agregues con «Presupuesto» va a este"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Seguir desde la búsqueda</span>
                        <span className="sm:hidden">Búsqueda</span>
                      </button>
                    )}
                  </div>
                  <QuoteEditor
                    quote={selected}
                    startSearching={freshId === selected.id}
                    onChanged={changed}
                    onDuplicated={(q) => {
                      setList((prev) => [q, ...prev]);
                      setTotal((t) => t + 1);
                      select(q.id);
                    }}
                    onRemoved={(id) => {
                      setList((prev) => prev.filter((q) => q.id !== id));
                      setTotal((t) => Math.max(0, t - 1));
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
      {preview && (
        <QuotePdfPreview
          quote={preview}
          onClose={() => setPreview(null)}
          onOpen={() => {
            select(preview.id);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
