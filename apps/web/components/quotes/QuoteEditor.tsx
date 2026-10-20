"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle, Archive, ArchiveRestore, ArrowDown, ArrowUp, Check, ChevronDown, Copy, CopyPlus, Download, ExternalLink,
  FileText, ImageOff, Loader2, MessageCircle, Minus, PenLine, Plus, RefreshCw, Search, Share2, ShoppingCart, Trash2, X,
} from "lucide-react";
import ProviderBadge, { providerLabel } from "@/components/ProviderBadge";
import { MarginInput } from "@/components/sale-margins/shared";
import { catalogApi, type ProductDTO, type Provider } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { proxyImg } from "@/lib/format";
import { formatMargin } from "@/lib/sale-margins";
import { useSellerSession } from "@/lib/sale-price";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  quoteError,
  quotesApi,
  shortDate,
  useQuoteConverter,
  useQuotes,
  type Quote,
  type QuoteClientPatch,
  type QuoteItem,
  type QuoteItemPatch,
  type QuoteMarginSource,
  type QuotePriceChange,
} from "@/lib/quotes";
import { buildQuotePdfModel, quotePdfFilename } from "./pdf/quote-pdf-model";
import QuoteProductSearch from "./QuoteProductSearch";
import { quoteText, useQuoteSettings, whatsappUrl } from "./quote-share";

type Busy = null | string;

const SOURCE_LABEL: Record<QuoteMarginSource, string> = {
  product: "del producto",
  condition: "por estado",
  subcategory: "de la subcategoría",
  category: "de la categoría",
  provider: "del proveedor",
  store: "general",
  none: "sin margen",
  line: "de esta línea",
  quote: "del presupuesto",
  manual: "precio a mano",
};

/**
 * Un presupuesto abierto: cliente, productos, márgenes, descuento, condiciones
 * y envío (PDF, WhatsApp, copiar). Lo usan la página de presupuestos y, en
 * versión compacta, la burbuja flotante.
 */
export default function QuoteEditor({
  quote,
  compact = false,
  onChanged,
  onRemoved,
  onDuplicated,
  startSearching = false,
}: {
  quote: Quote;
  compact?: boolean;
  /** Abre el buscador de productos de entrada (presupuesto recién creado). */
  startSearching?: boolean;
  onChanged?: (q: Quote) => void;
  onRemoved?: (id: string) => void;
  onDuplicated?: (q: Quote) => void;
}) {
  const quotes = useQuotes();
  const cart = useCart();
  const { canSeeCost } = useSellerSession();
  const settings = useQuoteSettings();
  const money = useQuoteConverter(quote.currency);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changes, setChanges] = useState<QuotePriceChange[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [searching, setSearching] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setChanges(null);
    setError(null);
    setNotice(null);
    setConfirmDelete(false);
    setSearching(startSearching && quote.items.length === 0);
    setCustomOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  const archived = Boolean(quote.archivedAt);
  const editable = !archived;
  const empty = quote.items.length === 0;

  const built = useMemo(() => (settings ? buildQuotePdfModel(quote, settings, money) : null), [quote, settings, money]);
  const model = built && "model" in built ? built.model : null;
  const total = model?.totals.find((t) => t.strong)?.value ?? "—";

  function apply(q: Quote) {
    quotes.upsert(q);
    onChanged?.(q);
  }

  async function run(kind: string, fn: () => Promise<void>, fallback: string) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(quoteError(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  const save = (patch: QuoteClientPatch, label = "No se pudo guardar") =>
    run("save", async () => apply((await quotesApi.update(quote.id, patch)).data), label);

  const updateItem = (index: number, patch: QuoteItemPatch, kind = `item:${index}`) =>
    run(kind, async () => apply((await quotesApi.updateItem(quote.id, index, patch)).data), "No se pudo cambiar la línea");

  const removeItem = (index: number) =>
    run(`rm:${index}`, async () => apply((await quotesApi.removeItem(quote.id, index)).data), "No se pudo quitar");

  const move = (index: number, to: number) =>
    run(`mv:${index}`, async () => apply((await quotesApi.moveItem(quote.id, index, to)).data), "No se pudo mover");

  const refresh = () =>
    run(
      "refresh",
      async () => {
        const { data } = await quotesApi.refreshPrices(quote.id);
        apply(data.quote);
        setChanges(data.changes);
      },
      "No se pudieron actualizar los precios"
    );

  async function addProduct(p: ProductDTO, qty: number) {
    const { data } = await quotesApi.addItem(quote.id, { provider: p.provider, externalId: p.externalId, qty });
    apply(data);
  }

  /** Lo compartió: queda como enviado (si era borrador). */
  async function markSent() {
    if (quote.status !== "DRAFT") return;
    try {
      apply((await quotesApi.markSent(quote.id)).data);
    } catch {
      /* no frena el envío */
    }
  }

  async function makePdf(): Promise<{ blob: Blob; filename: string } | null> {
    if (!settings) {
      setError("Todavía se está cargando la plantilla. Probá en un segundo.");
      return null;
    }
    if (!built || "error" in built) {
      setError(built && "error" in built ? built.error : "No se pudo armar el PDF");
      return null;
    }
    const { renderQuotePdf } = await import("./pdf/generate");
    const blob = await renderQuotePdf(built.model, settings.logoUrl);
    return { blob, filename: quotePdfFilename(built.model) };
  }

  const downloadPdf = () =>
    run(
      "pdf",
      async () => {
        const out = await makePdf();
        if (!out) return;
        const { downloadBlob } = await import("./pdf/generate");
        downloadBlob(out.blob, out.filename);
        await markSent();
      },
      "No se pudo armar el PDF"
    );

  const sharePdf = () =>
    run(
      "share",
      async () => {
        const out = await makePdf();
        if (!out || !model) return;
        const { shareBlob } = await import("./pdf/generate");
        if (await shareBlob(out.blob, out.filename, `Presupuesto ${model.code}`)) await markSent();
      },
      "No se pudo compartir el PDF"
    );

  async function copy() {
    if (!model) return;
    try {
      await navigator.clipboard.writeText(quoteText(model));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar. Probá con WhatsApp o el PDF.");
    }
  }

  const toggleArchive = () =>
    run(
      "archive",
      async () => {
        const { data } = archived ? await quotesApi.unarchive(quote.id) : await quotesApi.archive(quote.id);
        if (!archived && quotes.active?.id === quote.id) quotes.setActive(null);
        apply(data);
        if (!archived) await quotes.reload();
      },
      "No se pudo archivar"
    );

  const remove = () =>
    run(
      "delete",
      async () => {
        await quotes.remove(quote.id);
        onRemoved?.(quote.id);
      },
      "No se pudo eliminar"
    );

  const duplicate = () =>
    run(
      "dup",
      async () => {
        const { data } = await quotesApi.duplicate(quote.id);
        quotes.upsert(data);
        onDuplicated?.(data);
        setNotice(`Copiado como #${data.number}.`);
      },
      "No se pudo duplicar"
    );

  /** Quien ve costos puede pasar el presupuesto aceptado al carrito para comprarlo. */
  const toCart = () =>
    run(
      "cart",
      async () => {
        let added = 0;
        const products = quote.items.filter((it) => it.kind === "product");
        for (const it of products) {
          try {
            const { data: product } = await catalogApi.getProduct(it.provider as Provider, it.externalId);
            if (product?.externalId) {
              cart.add(product, it.qty);
              added++;
            }
          } catch {
            /* se informa abajo */
          }
        }
        const missing = products.length - added;
        setNotice(
          missing === 0
            ? `${added} ${added === 1 ? "producto pasó" : "productos pasaron"} al carrito.`
            : `Pasaron ${added} al carrito; ${missing} ya no ${missing === 1 ? "está" : "están"} en el catálogo.`
        );
      },
      "No se pudo pasar al carrito"
    );

  const atCostProviders = [...new Set(quote.items.filter((it) => it.marginSource === "none").map((it) => it.provider))];

  return (
    <div className="flex min-h-0 flex-col">
      {!compact && (
        <StatusBar quote={quote} busy={busy !== null} onStatus={(status) => save({ status }, "No se pudo cambiar el estado")} />
      )}

      <ClientFields quote={quote} compact={compact} disabled={busy !== null || !editable} onSave={(p) => save(p, "No se pudieron guardar los datos del cliente")} />

      {quote.atCostLines > 0 && (
        <div className="mx-3.5 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100" role="alert">
          <p className="flex items-start gap-1.5 font-semibold text-amber-200">
            <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
            {quote.atCostLines === 1 ? "1 producto va al costo" : `${quote.atCostLines} productos van al costo`}: no tienen margen de venta.
          </p>
          {quote.canEditMargins ? (
            <div className="mt-1 text-amber-100/80">
              <p>
                Ponele un margen a este presupuesto en <b>Precio y condiciones</b>, o configurá el margen del proveedor (vale para toda la
                búsqueda y los próximos presupuestos):
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {atCostProviders.map((p) => (
                  <Link key={p} href={`/proveedores/${encodeURIComponent(p)}?tab=margins`} className="inline-flex items-center gap-1 font-semibold text-amber-200 underline-offset-2 hover:underline">
                    Márgenes de {providerLabel(p)} <ExternalLink className="h-3 w-3" />
                  </Link>
                ))}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-amber-100/80">Pedile a quien administra el comercio que configure los márgenes de venta de esos proveedores.</p>
          )}
        </div>
      )}

      {editable && !compact && (
        searching ? (
          <div className="mt-3">
            <QuoteProductSearch quote={quote} format={(usd) => money.format(money.convert(usd, "USD"))} onAdd={addProduct} onClose={() => setSearching(false)} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 px-3.5 pt-3">
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500"
            >
              <Search className="h-3.5 w-3.5" /> Agregar productos
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white"
              title="Armado, envío, instalación o algo que no está en NODO"
            >
              <PenLine className="h-3.5 w-3.5" /> Línea libre
            </button>
          </div>
        )
      )}
      {customOpen && editable && !compact && (
        <CustomLineForm
          defaultCurrency={money.currency}
          onCancel={() => setCustomOpen(false)}
          onSave={(data) =>
            run(
              "custom",
              async () => {
                apply((await quotesApi.addCustom(quote.id, data)).data);
                setCustomOpen(false);
              },
              "No se pudo agregar la línea"
            )
          }
        />
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "max-h-[min(38dvh,20rem)]" : ""}`}>
        {empty ? (
          <div className="px-4 py-8 text-center">
            <FileText className="mx-auto mb-2 h-6 w-6 text-surface-700" />
            <p className="text-xs text-surface-400">Todavía no tiene productos.</p>
            <p className="mt-1 text-[11px] text-surface-500">
              {compact ? (
                <>
                  Tocá <span className="font-semibold text-surface-300">Presupuesto</span> en cualquier producto de la búsqueda.
                </>
              ) : (
                <>Usá «Agregar productos» o tocá «Presupuesto» en cualquier producto de la búsqueda.</>
              )}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-800/80 px-3.5 pt-1">
            {quote.items.map((it, index) => (
              <Line
                key={`${it.provider}:${it.externalId}`}
                item={it}
                index={index}
                count={quote.items.length}
                compact={compact}
                editable={editable}
                busy={busy}
                canEditMargins={quote.canEditMargins}
                unit={money.format(money.convert(it.unitFinalPrice, it.currency))}
                total={money.format(it.unitFinalPrice == null ? null : money.convert(it.unitFinalPrice * it.qty, it.currency))}
                onQty={(qty) => updateItem(index, { qty }, `qty:${index}`)}
                onMargin={(marginPercent) => updateItem(index, { marginPercent })}
                onCustom={(patch) => updateItem(index, patch)}
                onRemove={() => removeItem(index)}
                onMove={(to) => move(index, to)}
              />
            ))}
          </ul>
        )}
      </div>

      {changes && (
        <div className="mx-3.5 mb-2 mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-surface-300">
          {changes.length === 0 ? (
            <p className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-emerald-400" /> Los precios siguen iguales. La validez se renovó.
            </p>
          ) : (
            <>
              <p className="mb-1 font-semibold text-amber-200">Precios actualizados</p>
              <ul className="space-y-0.5">
                {changes.map((c) => (
                  <li key={`${c.provider}:${c.externalId}`} className="flex justify-between gap-3">
                    <span className="truncate">{c.name}</span>
                    <span className="flex-shrink-0 tabular-nums">
                      {c.after == null
                        ? "ya no tiene precio"
                        : `${money.format(money.convert(c.before, c.currency))} → ${money.format(money.convert(c.after, c.currency))}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!compact && editable && (
        <PricingSection
          quote={quote}
          open={pricingOpen}
          onToggle={() => setPricingOpen((v) => !v)}
          busy={busy !== null}
          maxSellerDiscount={settings?.maxSellerDiscount ?? null}
          defaultTerms={settings?.terms ?? null}
          onSave={(patch) => save(patch)}
        />
      )}

      {(error || notice) && (
        <p className={`mx-3.5 mt-2 text-[11px] ${error ? "text-red-300" : "text-emerald-300"}`} role="status">
          {error ?? notice}
        </p>
      )}

      <div className={`mt-2 border-t border-surface-800 px-3.5 py-3 ${compact ? "" : "bg-surface-950/95 lg:sticky lg:bottom-0 lg:z-10 lg:backdrop-blur"}`}>
        {model && (
          <div className="mb-3 space-y-0.5">
            {model.totals.map((t) =>
              t.strong ? (
                <div key={t.label} className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-surface-400">
                    {t.label}
                    {quote.itemCount > 0 ? ` · ${quote.itemCount} u.` : ""}
                  </span>
                  <span className="text-lg font-semibold tabular-nums text-white">{t.value}</span>
                </div>
              ) : (
                <div key={t.label} className="flex justify-between text-[11px] text-surface-500">
                  <span>{t.label}</span>
                  <span className="tabular-nums">{t.value}</span>
                </div>
              )
            )}
            {quote.validUntil && (
              <p className={`text-[10px] ${quote.status === "EXPIRED" ? "text-amber-300" : "text-surface-600"}`}>
                {quote.status === "EXPIRED" ? "Venció el" : "Válido hasta el"} {shortDate(quote.validUntil)}
                {quote.status === "EXPIRED" && " · actualizá los precios para renovarlo"}
              </p>
            )}
          </div>
        )}
        {!model && (
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs text-surface-500">Total</span>
            <span className="text-lg font-semibold tabular-nums text-white">{total}</span>
          </div>
        )}
        <div className={`grid gap-1.5 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          <ActionButton onClick={downloadPdf} disabled={empty || busy !== null} icon={busy === "pdf" ? Loader2 : Download} spin={busy === "pdf"} label="PDF" accent="brand" />
          {!compact && <ShareButton disabled={empty || busy !== null} busy={busy === "share"} onShare={sharePdf} />}
          <ActionButton
            href={empty || !model ? undefined : whatsappUrl(quoteText(model), quote.clientPhone)}
            onClick={() => void markSent()}
            disabled={empty || !model}
            icon={MessageCircle}
            label="WhatsApp"
            accent="green"
          />
          <ActionButton onClick={copy} disabled={empty || !model} icon={copied ? Check : Copy} label={copied ? "Copiado" : "Copiar"} />
        </div>
        {compact ? (
          <Link href={`/presupuestos?id=${encodeURIComponent(quote.id)}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-300 hover:text-brand-200">
            Abrir completo: márgenes, descuento, condiciones <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
            {editable && (
              <button type="button" onClick={refresh} disabled={busy !== null || empty} className="inline-flex items-center gap-1 text-surface-400 hover:text-white disabled:opacity-40">
                <RefreshCw className={`h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`} /> Actualizar precios
              </button>
            )}
            <button type="button" onClick={duplicate} disabled={busy !== null} className="inline-flex items-center gap-1 text-surface-400 hover:text-white disabled:opacity-40">
              <CopyPlus className="h-3 w-3" /> Duplicar
            </button>
            {canSeeCost === true && !empty && (
              <button type="button" onClick={toCart} disabled={busy !== null} className="inline-flex items-center gap-1 text-brand-300 hover:text-white disabled:opacity-40">
                {busy === "cart" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />} Pasar al carrito
              </button>
            )}
            <span className="ml-auto flex items-center gap-3">
              <button type="button" onClick={toggleArchive} disabled={busy !== null} className="inline-flex items-center gap-1 text-surface-500 hover:text-white disabled:opacity-40">
                {archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />} {archived ? "Reabrir" : "Archivar"}
              </button>
              {confirmDelete ? (
                <span className="inline-flex items-center gap-1.5">
                  <button type="button" onClick={remove} disabled={busy !== null} className="font-semibold text-red-300 hover:text-red-200">
                    {busy === "delete" ? "Eliminando…" : "Sí, eliminar"}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-surface-500 hover:text-white">
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 text-surface-500 hover:text-red-300 disabled:opacity-40"
                  aria-label="Eliminar presupuesto"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Estado del presupuesto: borrador → enviado → aceptado o rechazado. */
function StatusBar({ quote, busy, onStatus }: { quote: Quote; busy: boolean; onStatus: (s: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED") => void }) {
  const options: { value: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED"; label: string }[] = [
    { value: "DRAFT", label: "Borrador" },
    { value: "SENT", label: "Enviado" },
    { value: "ACCEPTED", label: "Aceptado" },
    { value: "REJECTED", label: "Rechazado" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-surface-800 px-3.5 py-2">
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUOTE_STATUS_TONE[quote.status]}`}>{QUOTE_STATUS_LABEL[quote.status]}</span>
      <span className="text-[10px] text-surface-500">Marcar como:</span>
      <div className="flex flex-wrap gap-1">
        {options
          .filter((o) => o.value !== quote.status)
          .map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={busy || Boolean(quote.archivedAt)}
              onClick={() => onStatus(o.value)}
              className="rounded-full border border-surface-700 px-2 py-0.5 text-[10px] text-surface-300 hover:border-surface-500 hover:text-white disabled:opacity-40"
            >
              {o.label}
            </button>
          ))}
      </div>
    </div>
  );
}

function Line({
  item: it,
  index,
  count,
  compact,
  editable,
  busy,
  canEditMargins,
  unit,
  total,
  onQty,
  onMargin,
  onCustom,
  onRemove,
  onMove,
}: {
  item: QuoteItem;
  index: number;
  count: number;
  compact: boolean;
  editable: boolean;
  busy: Busy;
  canEditMargins: boolean;
  unit: string;
  total: string;
  onQty: (qty: number) => void;
  onMargin: (m: number | null) => void;
  onCustom: (patch: QuoteItemPatch) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(it.name);
  const [price, setPrice] = useState(String(it.unitFinalPrice ?? ""));
  const anyBusy = busy !== null;
  const custom = it.kind === "custom";
  const atCost = it.marginSource === "none";

  return (
    <li className="py-2.5">
      {/* En celular (y en la burbuja) los controles bajan a una segunda fila: el nombre se lee entero. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md border border-surface-800 bg-white">
          {custom ? (
            <PenLine className="absolute inset-0 m-auto h-4 w-4 text-surface-500" />
          ) : it.imageUrl ? (
            <Image src={proxyImg(it.imageUrl)} alt="" fill className="object-contain p-0.5" unoptimized />
          ) : (
            <ImageOff className="absolute inset-0 m-auto h-3.5 w-3.5 text-surface-400" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs leading-snug text-surface-100">{it.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] tabular-nums text-surface-500">
            <span>{it.unitFinalPrice == null ? "Sin precio de venta" : `${unit} c/u`}</span>
            {!compact && !custom && <ProviderBadge provider={it.provider} variant="inline" size="sm" />}
            {atCost && <span className="font-semibold text-amber-300">al costo</span>}
            {canEditMargins && !custom && !atCost && it.marginSource && !compact && (
              <span className="text-surface-600">margen {SOURCE_LABEL[it.marginSource]}</span>
            )}
          </p>
        </div>
        <div className={`flex items-center justify-end gap-3 ${compact ? "w-full pl-[3.25rem]" : "w-full pl-[3.25rem] sm:w-auto sm:pl-0"}`}>
        {editable && (
          <div className="mr-auto flex items-center rounded-md border border-surface-700 bg-surface-900 sm:mr-0">
            <button
              type="button"
              disabled={anyBusy || it.qty <= 1}
              onClick={() => onQty(it.qty - 1)}
              className="flex h-7 w-7 items-center justify-center text-surface-400 hover:text-white disabled:opacity-30"
              aria-label="Uno menos"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[1.5rem] text-center text-xs font-semibold tabular-nums text-white">
              {busy === `qty:${index}` ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : it.qty}
            </span>
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => onQty(it.qty + 1)}
              className="flex h-7 w-7 items-center justify-center text-surface-400 hover:text-white disabled:opacity-30"
              aria-label="Uno más"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
        <span className="w-24 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-white">{total}</span>
        {editable && (
          <button
            type="button"
            disabled={anyBusy}
            onClick={onRemove}
            className="rounded p-1 text-surface-600 hover:text-red-400 disabled:opacity-40"
            aria-label={`Quitar ${it.name}`}
          >
            {busy === `rm:${index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}
        </div>
      </div>
      {editable && !compact && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[3.25rem] text-[10px]">
          {canEditMargins && !custom && (
            <span className="flex items-center gap-1.5 text-surface-500">
              Margen de esta línea
              <span className="w-20">
                <MarginInput
                  size="sm"
                  label={`Margen de ${it.name}`}
                  value={it.marginPercent}
                  inherited={null}
                  disabled={anyBusy}
                  onCommit={onMargin}
                />
              </span>
              {it.marginPercent != null && <span className="text-emerald-300">{formatMargin(it.marginPercent)} propio</span>}
            </span>
          )}
          {custom && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-surface-400 hover:text-white">
              Editar nombre o precio
            </button>
          )}
          <span className="ml-auto flex items-center gap-1">
            <button type="button" disabled={anyBusy || index === 0} onClick={() => onMove(index - 1)} className="rounded p-0.5 text-surface-600 hover:text-white disabled:opacity-30" aria-label="Subir">
              <ArrowUp className="h-3 w-3" />
            </button>
            <button type="button" disabled={anyBusy || index === count - 1} onClick={() => onMove(index + 1)} className="rounded p-0.5 text-surface-600 hover:text-white disabled:opacity-30" aria-label="Bajar">
              <ArrowDown className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
      {custom && editing && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2 pl-[3.25rem]"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(price.replace(",", "."));
            if (!name.trim() || !Number.isFinite(n) || n < 0) return;
            onCustom({ name: name.trim(), unitFinalPrice: Math.round(n * 100) / 100 });
            setEditing(false);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={300} aria-label="Nombre" className="min-w-0 flex-1 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-white focus:border-brand-500 focus:outline-none" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" aria-label="Precio final con IVA" className="w-24 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-right text-xs tabular-nums text-white focus:border-brand-500 focus:outline-none" />
          <span className="text-[10px] text-surface-500">{it.currency}</span>
          <button type="submit" className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-500">
            Guardar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-surface-500 hover:text-white">
            Cancelar
          </button>
        </form>
      )}
    </li>
  );
}

function CustomLineForm({
  defaultCurrency,
  onSave,
  onCancel,
}: {
  defaultCurrency: "ARS" | "USD";
  onSave: (data: { name: string; unitFinalPrice: number; currency: "ARS" | "USD"; qty: number; ivaPercent: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">(defaultCurrency);
  const [qty, setQty] = useState("1");
  const [iva, setIva] = useState("21");
  const [err, setErr] = useState<string | null>(null);
  const input = "rounded-md border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-xs text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";
  return (
    <form
      className="mx-3.5 mt-2 rounded-lg border border-surface-700 bg-surface-900/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(price.replace(/\./g, "").replace(",", "."));
        const q = Math.floor(Number(qty));
        if (!name.trim()) return setErr("Poné qué es (por ejemplo: Armado y prueba).");
        if (!Number.isFinite(n) || n < 0) return setErr("Poné el precio final, con IVA.");
        if (!Number.isFinite(q) || q < 1) return setErr("La cantidad tiene que ser 1 o más.");
        setErr(null);
        onSave({ name: name.trim(), unitFinalPrice: Math.round(n * 100) / 100, currency, qty: q, ivaPercent: Number(iva) });
      }}
    >
      <p className="mb-2 text-[11px] font-semibold text-white">Línea libre</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_5.5rem_4rem_5rem]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Armado y prueba, envío, instalación…" maxLength={300} aria-label="Qué es" className={input} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Precio final" aria-label="Precio final con IVA" className={`${input} text-right tabular-nums`} />
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "ARS" | "USD")} aria-label="Moneda" className={input}>
          <option value="ARS">Pesos</option>
          <option value="USD">Dólares</option>
        </select>
        <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" aria-label="Cantidad" className={`${input} text-right`} />
        <select value={iva} onChange={(e) => setIva(e.target.value)} aria-label="IVA incluido" className={input}>
          <option value="21">IVA 21 %</option>
          <option value="10.5">IVA 10,5 %</option>
          <option value="0">Sin IVA</option>
        </select>
      </div>
      {err && <p className="mt-1.5 text-[11px] text-red-300">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500">
          Agregar línea
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-surface-400 hover:text-white">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Moneda, margen del presupuesto, descuento, validez y condiciones. */
function PricingSection({
  quote,
  open,
  onToggle,
  busy,
  maxSellerDiscount,
  defaultTerms,
  onSave,
}: {
  quote: Quote;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  maxSellerDiscount: number | null;
  defaultTerms: string | null;
  onSave: (patch: QuoteClientPatch) => void;
}) {
  const [discount, setDiscount] = useState(quote.discountPercent == null ? "" : String(quote.discountPercent));
  const [terms, setTerms] = useState(quote.terms ?? "");
  useEffect(() => {
    setDiscount(quote.discountPercent == null ? "" : String(quote.discountPercent));
    setTerms(quote.terms ?? "");
  }, [quote.id, quote.discountPercent, quote.terms]);

  const summary = [
    quote.currency === "ARS" ? "En pesos" : quote.currency === "USD" ? "En dólares" : "Moneda según preferencia",
    quote.canEditMargins && quote.marginPercent != null ? `margen ${formatMargin(quote.marginPercent)}` : null,
    quote.discountPercent ? `descuento ${formatMargin(quote.discountPercent)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const label = "text-[10px] font-semibold uppercase tracking-wider text-surface-500";
  return (
    <div className="mx-3.5 mt-3 rounded-lg border border-surface-800">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span>
          <span className="block text-xs font-semibold text-white">Precio y condiciones</span>
          <span className="block text-[10px] text-surface-500">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid gap-3 border-t border-surface-800 px-3 py-3 sm:grid-cols-2">
          <div>
            <p className={label}>Moneda para el cliente</p>
            <div className="mt-1 flex rounded-lg border border-surface-700 p-0.5 text-[11px]" role="radiogroup">
              {(
                [
                  [null, "Según preferencia"],
                  ["ARS", "Pesos"],
                  ["USD", "Dólares"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={quote.currency === value}
                  disabled={busy}
                  onClick={() => quote.currency !== value && onSave({ currency: value })}
                  className={`flex-1 rounded-md px-2 py-1 ${quote.currency === value ? "bg-surface-700 text-white" : "text-surface-400 hover:text-white"}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={label}>Válido hasta</p>
            <input
              type="date"
              disabled={busy}
              value={quote.validUntil ? quote.validUntil.slice(0, 10) : ""}
              onChange={(e) => onSave({ validUntil: e.target.value ? new Date(`${e.target.value}T23:59:00-03:00`).toISOString() : null })}
              className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
            />
          </div>
          {quote.canEditMargins && (
            <div>
              <p className={label}>Margen de este presupuesto</p>
              <div className="mt-1 w-28">
                <MarginInput
                  size="sm"
                  label="Margen de este presupuesto"
                  value={quote.marginPercent}
                  inherited={null}
                  disabled={busy}
                  onCommit={(next) => onSave({ marginPercent: next })}
                />
              </div>
              <p className="mt-1 text-[10px] leading-snug text-surface-500">
                Pisa los márgenes de los proveedores en todo este presupuesto (y recalcula los precios). Vacío = el de cada proveedor.
              </p>
            </div>
          )}
          <div>
            <p className={label}>Descuento</p>
            <div className="relative mt-1 w-28">
              <input
                value={discount}
                disabled={busy}
                inputMode="decimal"
                onChange={(e) => setDiscount(e.target.value)}
                onBlur={() => {
                  const raw = discount.replace(",", ".").replace("%", "").trim();
                  const n = raw ? Number(raw) : null;
                  if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) return setDiscount(quote.discountPercent == null ? "" : String(quote.discountPercent));
                  if (n !== quote.discountPercent) onSave({ discountPercent: n == null || n === 0 ? null : Math.round(n * 100) / 100 });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label="Descuento sobre el total"
                placeholder="0"
                className="h-8 w-full rounded-lg border border-surface-700 bg-surface-800 pl-2.5 pr-7 font-mono text-xs tabular-nums text-white focus:border-brand-500 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-surface-500">%</span>
            </div>
            <p className="mt-1 text-[10px] text-surface-500">
              Sobre el total; el cliente lo ve.
              {!quote.canEditMargins && maxSellerDiscount != null && ` Hasta ${formatMargin(maxSellerDiscount)}.`}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className={label}>Condiciones de este presupuesto</p>
            <textarea
              value={terms}
              disabled={busy}
              onChange={(e) => setTerms(e.target.value)}
              onBlur={() => terms.trim() !== (quote.terms ?? "") && onSave({ terms: terms.trim() || null })}
              rows={3}
              maxLength={3000}
              placeholder={defaultTerms ? `Si lo dejás vacío van las de la plantilla: ${defaultTerms.slice(0, 120)}${defaultTerms.length > 120 ? "…" : ""}` : "Forma de pago, entrega, garantía…"}
              className="mt-1 w-full resize-none rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-xs text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ShareButton({ disabled, busy, onShare }: { disabled: boolean; busy: boolean; onShare: () => void }) {
  const [can, setCan] = useState(false);
  useEffect(() => {
    void import("./pdf/generate").then((m) => setCan(m.canShareFiles()));
  }, []);
  if (!can) return null;
  return <ActionButton onClick={onShare} disabled={disabled} icon={busy ? Loader2 : Share2} spin={busy} label="Mandar PDF" />;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
  accent,
  spin,
}: {
  icon: typeof Copy;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  accent?: "green" | "brand";
  spin?: boolean;
}) {
  const tone =
    accent === "green"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
      : accent === "brand"
        ? "border-brand-500/50 bg-brand-600 text-white hover:bg-brand-500"
        : "border-surface-700 bg-surface-900 text-surface-200 hover:border-surface-500 hover:text-white";
  const cls = `flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${tone} ${disabled ? "pointer-events-none opacity-40" : ""}`;
  const icon = <Icon className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} />;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} aria-disabled={disabled} onClick={onClick}>
        {icon} {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {icon} {label}
    </button>
  );
}

/** Nombre, teléfono, mail y notas del cliente: todo opcional, se guarda al salir del campo. */
function ClientFields({
  quote,
  compact,
  disabled,
  onSave,
}: {
  quote: Quote;
  compact: boolean;
  disabled: boolean;
  onSave: (patch: QuoteClientPatch) => void;
}) {
  const [title, setTitle] = useState(quote.title ?? "");
  const [name, setName] = useState(quote.clientName ?? "");
  const [phone, setPhone] = useState(quote.clientPhone ?? "");
  const [email, setEmail] = useState(quote.clientEmail ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [showMore, setShowMore] = useState(Boolean(quote.notes || quote.clientEmail));

  useEffect(() => {
    setTitle(quote.title ?? "");
    setName(quote.clientName ?? "");
    setPhone(quote.clientPhone ?? "");
    setEmail(quote.clientEmail ?? "");
    setNotes(quote.notes ?? "");
    setShowMore(Boolean(quote.notes || quote.clientEmail));
  }, [quote.id, quote.title, quote.clientName, quote.clientPhone, quote.clientEmail, quote.notes]);

  const commit = (field: "title" | "clientName" | "clientPhone" | "clientEmail" | "notes", value: string, current: string | null) => {
    const next = value.trim();
    if (next === (current ?? "")) return;
    onSave({ [field]: next || null });
  };

  const input =
    "w-full min-w-0 rounded-md border border-transparent bg-surface-900 px-2.5 py-1.5 text-xs text-white placeholder:text-surface-600 hover:border-surface-700 focus:border-brand-500 focus:outline-none";

  return (
    <div className={`border-b border-surface-800 px-3.5 ${compact ? "py-2.5" : "py-3"}`}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => commit("title", title, quote.title)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        disabled={disabled}
        maxLength={120}
        placeholder="Nombre de referencia: «Oficina Pérez, 3 PCs»"
        aria-label="Nombre de referencia del presupuesto"
        title="Para encontrarlo después en la lista. Sale también en el PDF."
        className={`${input} mb-1.5 text-sm font-medium`}
      />
      <div className="grid grid-cols-[1.4fr_1fr] gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => commit("clientName", name, quote.clientName)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          disabled={disabled}
          maxLength={120}
          placeholder="Cliente (opcional)"
          aria-label="Nombre del cliente"
          className={input}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => commit("clientPhone", phone, quote.clientPhone)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          disabled={disabled}
          maxLength={40}
          inputMode="tel"
          placeholder="WhatsApp"
          aria-label="Teléfono del cliente"
          className={input}
        />
      </div>
      {showMore ? (
        <div className="mt-1.5 grid gap-1.5">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => commit("clientEmail", email, quote.clientEmail)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            disabled={disabled}
            maxLength={160}
            inputMode="email"
            placeholder="Mail del cliente"
            aria-label="Mail del cliente"
            className={input}
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => commit("notes", notes, quote.notes)}
            disabled={disabled}
            maxLength={2000}
            rows={2}
            placeholder="Notas para el cliente (salen en el PDF)"
            aria-label="Notas"
            className={`${input} resize-none`}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="mt-1.5 text-[11px] text-surface-500 hover:text-surface-200">
          + Mail y notas
        </button>
      )}
    </div>
  );
}
