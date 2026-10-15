"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Store, X } from "lucide-react";
import { invalidateMyProviders, storefrontApi, type StorefrontOffer } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { isRetailerSession } from "@/lib/purchase";
import { apiError, DELIVERY_OPTION_LABEL, labelsOf, PAYMENT_METHOD_LABEL } from "@/lib/storefront";

const SNOOZE_KEY = "nodo.storefrontOffers.snoozed";

function snoozed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function snooze(id: string) {
  try {
    sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...snoozed(), id]));
  } catch {
    /* sin storage: vuelve a aparecer al recargar */
  }
}

/** Ofertas de tiendas de locales para este comercio (solo quien maneja proveedores decide). */
function useOffers(enabled: boolean) {
  const [offers, setOffers] = useState<StorefrontOffer[] | null>(null);
  const load = useCallback(async () => {
    try {
      setOffers((await storefrontApi.offers()).data);
    } catch {
      setOffers([]);
    }
  }, []);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);
  return { offers, reload: load };
}

function Logo({ offer, size = "h-10 w-10" }: { offer: StorefrontOffer; size?: string }) {
  return offer.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={proxyImg(offer.logoUrl, { trim: false })} alt="" className={`${size} flex-shrink-0 rounded-xl border border-surface-700 bg-white object-contain`} />
  ) : (
    <span className={`${size} grid flex-shrink-0 place-items-center rounded-xl bg-brand-600/15 text-brand-300`}>
      <Store className="h-5 w-5" aria-hidden />
    </span>
  );
}

function summary(o: StorefrontOffer): string {
  const parts = [
    `${o.productCount} ${o.productCount === 1 ? "producto" : "productos"}`,
    o.categories.length ? o.categories.slice(0, 3).join(", ") : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * "X está vendiendo en NODO, ¿querés ver sus productos?". Se muestra arriba del
 * buscador y del inicio mientras haya tiendas sin contestar. «Ahora no» la
 * esconde hasta la próxima sesión; la decisión queda en Configuración.
 */
export function StorefrontOffersPrompt({ className = "" }: { className?: string }) {
  const canManage = useCan("providers.manage");
  const [retailer, setRetailer] = useState(false);
  useEffect(() => setRetailer(isRetailerSession()), []);
  const { offers, reload } = useOffers(Boolean(canManage) && retailer);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setHidden(snoozed()), []);

  const pending = (offers ?? []).filter((o) => o.audienceStatus === "PENDING" && !hidden.has(o.storefrontId));
  if (!canManage || !retailer || pending.length === 0) return null;
  const offer = pending[0];

  async function decide(decision: "ACCEPT" | "DECLINE") {
    setWorking(decision);
    setError(null);
    try {
      await storefrontApi.decide(offer.storefrontId, decision);
      if (decision === "ACCEPT") invalidateMyProviders();
      await reload();
    } catch (err) {
      setError(apiError(err, "No se pudo guardar"));
    } finally {
      setWorking(null);
    }
  }

  function later() {
    snooze(offer.storefrontId);
    setHidden(snoozed());
  }

  const terms = [...labelsOf(offer.paymentMethods, PAYMENT_METHOD_LABEL), ...labelsOf(offer.deliveryOptions, DELIVERY_OPTION_LABEL)];

  return (
    <section className={`rounded-2xl border border-brand-500/30 bg-brand-600/5 p-4 ${className}`} aria-label="Tienda de un local">
      <div className="flex flex-wrap items-start gap-3">
        <Logo offer={offer} />
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-semibold text-white">
            {offer.name} está vendiendo en NODO. ¿Querés ver sus productos?
          </p>
          <p className="mt-0.5 text-xs text-surface-300">{summary(offer)}</p>
          {offer.about && <p className="mt-1 line-clamp-2 text-xs text-surface-400">{offer.about}</p>}
          {terms.length > 0 && <p className="mt-1 text-[11px] text-surface-500">{terms.join(" · ")}</p>}
          <p className="mt-1 text-[11px] text-surface-500">
            Es otro local, no un distribuidor: los pedidos los confirma él y el pago lo arreglan entre ustedes.
            {pending.length > 1 ? ` Hay ${pending.length - 1} más esperando.` : ""}
          </p>
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void decide("ACCEPT")}
            disabled={working !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {working === "ACCEPT" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Ver sus productos
          </button>
          <button
            type="button"
            onClick={() => void decide("DECLINE")}
            disabled={working !== null}
            className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-200 hover:text-white disabled:opacity-50"
          >
            {working === "DECLINE" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "No, gracias"}
          </button>
          <button type="button" onClick={later} aria-label="Ahora no" title="Ahora no" className="grid h-8 w-8 place-items-center rounded-lg text-surface-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Configuración → Tiendas de locales: qué tiendas ve el comercio, y cambiarlo. */
export function StorefrontSubscriptions() {
  const canManage = useCan("providers.manage");
  const [retailer, setRetailer] = useState(false);
  useEffect(() => setRetailer(isRetailerSession()), []);
  const { offers, reload } = useOffers(retailer);
  const [working, setWorking] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  if (!retailer) return null;

  async function decide(o: StorefrontOffer, decision: "ACCEPT" | "DECLINE") {
    setWorking(o.storefrontId);
    setAviso(null);
    try {
      await storefrontApi.decide(o.storefrontId, decision);
      invalidateMyProviders();
      await reload();
      setAviso({ ok: true, text: decision === "ACCEPT" ? `Ya ves los productos de ${o.name}.` : `Dejaste de ver a ${o.name}.` });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo guardar") });
    } finally {
      setWorking(null);
    }
  }

  const statusText: Record<string, string> = {
    ACCEPTED: "La ves",
    PENDING: "Sin elegir",
    DECLINED: "No la ves",
  };

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Store className="h-4 w-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-white">Tiendas de locales</h2>
      </div>
      <p className="text-[11px] leading-snug text-surface-500">
        Otros comercios de NODO que venden su stock. Elegí cuáles querés ver en tu buscador; lo podés cambiar cuando quieras.
      </p>
      {offers === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
        </div>
      ) : offers.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-surface-700 px-3 py-4 text-center text-xs text-surface-400">
          Todavía ningún local te ofreció su tienda.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-surface-800 rounded-xl border border-surface-800">
          {offers.map((o) => {
            const on = o.audienceStatus === "ACCEPTED";
            return (
              <li key={o.storefrontId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Logo offer={o} size="h-8 w-8" />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm text-white">{o.name}</p>
                  <p className="truncate text-[11px] text-surface-500">
                    {statusText[o.audienceStatus] ?? ""} · {summary(o)}
                    {o.source === "INVITE" ? " · por invitación" : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void decide(o, "ACCEPT")}
                      disabled={working !== null || on}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                        on ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-surface-700 text-surface-300 hover:text-white"
                      } disabled:cursor-default`}
                    >
                      {working === o.storefrontId && !on ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide(o, "DECLINE")}
                      disabled={working !== null || o.audienceStatus === "DECLINED"}
                      aria-pressed={o.audienceStatus === "DECLINED"}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                        o.audienceStatus === "DECLINED" ? "border-surface-500 bg-surface-800 text-white" : "border-surface-700 text-surface-300 hover:text-white"
                      } disabled:cursor-default`}
                    >
                      {working === o.storefrontId && on ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                      No ver
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-surface-500">Lo elige el dueño o un administrador</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {aviso && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}
    </section>
  );
}
