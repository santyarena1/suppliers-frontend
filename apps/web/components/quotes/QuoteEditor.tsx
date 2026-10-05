"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Archive, ArchiveRestore, Check, Copy, ImageOff, Loader2, MessageCircle, Minus, Plus, Printer, RefreshCw, ShoppingCart, Trash2, X,
} from "lucide-react";
import { catalogApi, type Provider } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { proxyImg } from "@/lib/format";
import { useSellerSession } from "@/lib/sale-price";
import {
  quoteError,
  quotesApi,
  useQuoteMoney,
  useQuoteTotal,
  useQuotes,
  type Quote,
  type QuoteClientPatch,
  type QuotePriceChange,
} from "@/lib/quotes";
import { printQuote, quoteText, whatsappUrl } from "./quote-share";

type Busy = null | "client" | "refresh" | "archive" | "delete" | "cart" | `qty:${number}` | `rm:${number}`;

/**
 * Un presupuesto abierto: datos del cliente, productos y acciones. Lo usan la
 * burbuja flotante (compacto) y la página de presupuestos.
 */
export default function QuoteEditor({
  quote,
  compact = false,
  onChanged,
  onRemoved,
}: {
  quote: Quote;
  compact?: boolean;
  onChanged?: (q: Quote) => void;
  onRemoved?: (id: string) => void;
}) {
  const quotes = useQuotes();
  const cart = useCart();
  const { canSeeCost } = useSellerSession();
  const money = useQuoteMoney();
  const totalOf = useQuoteTotal();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changes, setChanges] = useState<QuotePriceChange[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setChanges(null);
    setError(null);
    setNotice(null);
    setConfirmDelete(false);
  }, [quote.id]);

  const total = totalOf(quote);
  const storeName = getTenant()?.name ?? null;
  const share = { storeName, money, total };
  const archived = Boolean(quote.archivedAt);

  function apply(q: Quote) {
    quotes.upsert(q);
    onChanged?.(q);
  }

  async function run(kind: Exclude<Busy, null>, fn: () => Promise<void>, fallback: string) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(quoteError(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  const saveClient = (patch: QuoteClientPatch) =>
    run("client", async () => apply((await quotesApi.update(quote.id, patch)).data), "No se pudieron guardar los datos del cliente");

  const setQty = (index: number, qty: number) =>
    run(`qty:${index}`, async () => apply((await quotesApi.setQty(quote.id, index, qty)).data), "No se pudo cambiar la cantidad");

  const removeItem = (index: number) =>
    run(`rm:${index}`, async () => apply((await quotesApi.removeItem(quote.id, index)).data), "No se pudo quitar el producto");

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

  const toggleArchive = () =>
    run(
      "archive",
      async () => {
        const { data } = archived ? await quotesApi.unarchive(quote.id) : await quotesApi.archive(quote.id);
        if (archived) apply(data);
        else {
          if (quotes.active?.id === quote.id) quotes.setActive(null);
          apply(data);
          await quotes.reload();
        }
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

  /** Quien compra puede pasar el presupuesto al carrito de compra (ahí ve costos). */
  const toCart = () =>
    run(
      "cart",
      async () => {
        let added = 0;
        for (const it of quote.items) {
          try {
            const { data: product } = await catalogApi.getProduct(it.provider as Provider, it.externalId);
            if (product?.externalId) {
              cart.add(product, it.qty);
              added++;
            }
          } catch {
            /* se informa abajo como no agregado */
          }
        }
        const missing = quote.items.length - added;
        setNotice(
          missing === 0
            ? `${added} ${added === 1 ? "producto pasó" : "productos pasaron"} al carrito.`
            : `Pasaron ${added} al carrito; ${missing} ya no ${missing === 1 ? "está" : "están"} en el catálogo.`
        );
      },
      "No se pudo pasar al carrito"
    );

  async function copy() {
    try {
      await navigator.clipboard.writeText(quoteText(quote, share));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("No se pudo copiar. Probá con WhatsApp o imprimir.");
    }
  }

  const empty = quote.items.length === 0;

  return (
    <div className="flex min-h-0 flex-col">
      <ClientFields quote={quote} compact={compact} disabled={busy !== null} onSave={saveClient} />

      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "max-h-[min(38dvh,20rem)]" : ""}`}>
        {empty ? (
          <p className="px-4 py-8 text-center text-xs text-surface-500">
            Todavía no tiene productos. Agregalos desde la búsqueda con el botón{" "}
            <span className="font-semibold text-surface-300">Presupuesto</span>.
          </p>
        ) : (
          <ul className="divide-y divide-surface-800/80 px-3.5">
            {quote.items.map((it, index) => (
              <li key={`${it.provider}:${it.externalId}`} className="flex items-center gap-3 py-2.5">
                <span className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md border border-surface-800 bg-white">
                  {it.imageUrl ? (
                    <Image src={proxyImg(it.imageUrl)} alt="" fill className="object-contain p-0.5" unoptimized />
                  ) : (
                    <ImageOff className="absolute inset-0 m-auto h-3.5 w-3.5 text-surface-400" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-snug text-surface-100">{it.name}</p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-surface-500">
                    {it.unitFinalPrice == null ? "Sin precio de venta" : `${money(it.unitFinalPrice, it.currency)} c/u`}
                  </p>
                </div>
                {!archived && (
                  <div className="flex items-center rounded-md border border-surface-700 bg-surface-900">
                    <button
                      type="button"
                      disabled={busy !== null || it.qty <= 1}
                      onClick={() => setQty(index, it.qty - 1)}
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
                      disabled={busy !== null}
                      onClick={() => setQty(index, it.qty + 1)}
                      className="flex h-7 w-7 items-center justify-center text-surface-400 hover:text-white disabled:opacity-30"
                      aria-label="Uno más"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="w-20 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-white">
                  {it.unitFinalPrice == null ? "—" : money(it.unitFinalPrice * it.qty, it.currency)}
                </span>
                {!archived && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => removeItem(index)}
                    className="rounded p-1 text-surface-600 hover:text-red-400 disabled:opacity-40"
                    aria-label={`Quitar ${it.name}`}
                  >
                    {busy === `rm:${index}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {changes && (
        <div className="mx-3.5 mb-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-surface-300">
          {changes.length === 0 ? (
            <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-400" /> Los precios siguen iguales.</p>
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
                        : `${money(c.before, c.currency)} → ${money(c.after, c.currency)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {(error || notice) && (
        <p className={`mx-3.5 mb-2 text-[11px] ${error ? "text-red-300" : "text-emerald-300"}`} role="status">
          {error ?? notice}
        </p>
      )}

      <div className="border-t border-surface-800 px-3.5 py-3">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-xs text-surface-500">
            Total{quote.itemCount > 0 ? ` · ${quote.itemCount} u.` : ""} <span className="text-surface-600">· con IVA</span>
          </span>
          <span className="text-lg font-semibold tabular-nums text-white">{total}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <ActionButton onClick={copy} disabled={empty} icon={copied ? Check : Copy} label={copied ? "Copiado" : "Copiar"} />
          <ActionButton
            href={empty ? undefined : whatsappUrl(quoteText(quote, share), quote.clientPhone)}
            disabled={empty}
            icon={MessageCircle}
            label="WhatsApp"
            accent
          />
          <ActionButton
            onClick={() => {
              if (!printQuote(quote, share)) setError("El navegador bloqueó la ventana para imprimir.");
            }}
            disabled={empty}
            icon={Printer}
            label="Imprimir"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
          {!archived && (
            <button
              type="button"
              onClick={refresh}
              disabled={busy !== null || empty}
              className="inline-flex items-center gap-1 text-surface-400 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 ${busy === "refresh" ? "animate-spin" : ""}`} /> Actualizar precios
            </button>
          )}
          {canSeeCost === true && !empty && (
            <button
              type="button"
              onClick={toCart}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 text-brand-300 hover:text-white disabled:opacity-40"
            >
              {busy === "cart" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />} Pasar al carrito
            </button>
          )}
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={toggleArchive}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 text-surface-500 hover:text-white disabled:opacity-40"
            >
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
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon, label, onClick, href, disabled, accent,
}: {
  icon: typeof Copy;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  accent?: boolean;
}) {
  const cls = `flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
    accent
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
      : "border-surface-700 bg-surface-900 text-surface-200 hover:border-surface-500 hover:text-white"
  } ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} aria-disabled={disabled}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/** Nombre, teléfono y notas del cliente: todo opcional, se guarda al salir del campo. */
function ClientFields({
  quote, compact, disabled, onSave,
}: {
  quote: Quote;
  compact: boolean;
  disabled: boolean;
  onSave: (patch: QuoteClientPatch) => void;
}) {
  const [name, setName] = useState(quote.clientName ?? "");
  const [phone, setPhone] = useState(quote.clientPhone ?? "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(quote.notes));

  useEffect(() => {
    setName(quote.clientName ?? "");
    setPhone(quote.clientPhone ?? "");
    setNotes(quote.notes ?? "");
    setShowNotes(Boolean(quote.notes));
  }, [quote.id, quote.clientName, quote.clientPhone, quote.notes]);

  const commit = (field: keyof QuoteClientPatch, value: string, current: string | null) => {
    const next = value.trim();
    if (next === (current ?? "")) return;
    onSave({ [field]: next || null });
  };

  const input =
    "w-full min-w-0 rounded-md border border-transparent bg-surface-900 px-2.5 py-1.5 text-xs text-white placeholder:text-surface-600 hover:border-surface-700 focus:border-brand-500 focus:outline-none";

  return (
    <div className={`border-b border-surface-800 px-3.5 ${compact ? "py-2.5" : "py-3"}`}>
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
          placeholder="Teléfono"
          aria-label="Teléfono del cliente"
          className={input}
        />
      </div>
      {showNotes ? (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => commit("notes", notes, quote.notes)}
          disabled={disabled}
          maxLength={2000}
          rows={2}
          placeholder="Notas (entrega, forma de pago…)"
          aria-label="Notas"
          className={`${input} mt-1.5 resize-none`}
        />
      ) : (
        <button type="button" onClick={() => setShowNotes(true)} className="mt-1.5 text-[11px] text-surface-500 hover:text-surface-200">
          + Agregar nota
        </button>
      )}
    </div>
  );
}
