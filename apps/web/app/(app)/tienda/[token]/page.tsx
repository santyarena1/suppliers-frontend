"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Store } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import { invalidateMyProviders, storefrontApi, type StorefrontInvitePreview } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import {
  apiError,
  buyerStockText,
  DELIVERY_OPTION_LABEL,
  INVOICE_TYPE_LABEL,
  labelsOf,
  PAYMENT_METHOD_LABEL,
} from "@/lib/storefront";

/** Link de invitación de una tienda: quién es, qué vende y entrar a verla. */
export default function StorefrontInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const canManage = useCan("providers.manage");
  const [store, setStore] = useState<StorefrontInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    storefrontApi
      .invite(token)
      .then((r) => setStore(r.data))
      .catch((err) => setError(apiError(err, "El link de invitación no existe o ya no vale")));
  }, [token]);

  async function accept() {
    if (!store) return;
    setWorking(true);
    setError(null);
    try {
      await storefrontApi.acceptInvite(token);
      invalidateMyProviders();
      setDone(true);
    } catch (err) {
      setError(apiError(err, "No se pudo entrar a la tienda"));
    } finally {
      setWorking(false);
    }
  }

  const terms = store
    ? [
        ...labelsOf(store.paymentMethods, PAYMENT_METHOD_LABEL),
        ...labelsOf(store.deliveryOptions, DELIVERY_OPTION_LABEL),
        ...labelsOf(store.invoiceTypes, INVOICE_TYPE_LABEL),
      ]
    : [];
  const stock = store ? buyerStockText(store.stockState, store.stockConfirmedAt) : null;
  const already = store?.audienceStatus === "ACCEPTED" || done;

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Tienda de un local</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Te pasaron el link para ver sus productos en NODO</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8 sm:px-6">
          {!store && !error && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            </div>
          )}
          {error && !store && (
            <section className="rounded-2xl border border-surface-800 bg-surface-900 p-6 text-center">
              <p className="text-sm font-semibold text-white">{error}</p>
              <p className="mt-1 text-xs text-surface-400">Pedile al local que te pase su link de nuevo.</p>
              <Link href="/" className="mt-4 inline-block text-xs text-brand-300 hover:text-brand-200">
                Ir al inicio
              </Link>
            </section>
          )}
          {store && (
            <section className="rounded-2xl border border-surface-800 bg-surface-900 p-6">
              <div className="flex items-start gap-4">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(store.logoUrl, { trim: false })} alt="" className="h-16 w-16 rounded-2xl border border-surface-700 bg-white object-contain" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600/15 text-brand-300">
                    <Store className="h-7 w-7" aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-white">{store.name}</p>
                  <p className="text-xs text-surface-400">
                    {store.productCount} {store.productCount === 1 ? "producto" : "productos"}
                    {store.categories.length ? ` · ${store.categories.join(", ")}` : ""}
                  </p>
                  {stock && <p className={`mt-1 text-[11px] ${stock.warn ? "text-amber-300" : "text-surface-500"}`}>{stock.text}</p>}
                </div>
              </div>
              {store.about && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-surface-200">{store.about}</p>}
              {(terms.length > 0 || store.contactNote || store.defaultWarranty) && (
                <dl className="mt-4 grid gap-2 rounded-xl border border-surface-800 bg-surface-950/40 p-3 text-xs">
                  {terms.length > 0 && (
                    <div>
                      <dt className="text-surface-500">Pago, entrega y factura</dt>
                      <dd className="text-surface-100">{terms.join(" · ")}</dd>
                    </div>
                  )}
                  {store.defaultWarranty && (
                    <div>
                      <dt className="text-surface-500">Garantía</dt>
                      <dd className="text-surface-100">{store.defaultWarranty}</dd>
                    </div>
                  )}
                  {store.contactNote && (
                    <div>
                      <dt className="text-surface-500">Zona y horarios</dt>
                      <dd className="whitespace-pre-wrap text-surface-100">{store.contactNote}</dd>
                    </div>
                  )}
                </dl>
              )}

              <div className="mt-5">
                {store.own ? (
                  <p className="rounded-lg bg-surface-800 px-3 py-2 text-xs text-surface-200">
                    Es tu tienda: este es el link que les pasás a otros comercios.{" "}
                    <Link href="/vender?tab=datos" className="text-brand-300 hover:text-brand-200">
                      Configurarla
                    </Link>
                  </p>
                ) : !store.canAccept ? (
                  <p className="rounded-lg bg-surface-800 px-3 py-2 text-xs text-surface-200">Las tiendas de locales son para comercios.</p>
                ) : already ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="inline-flex items-center gap-1.5 text-sm text-emerald-300">
                      <Check className="h-4 w-4" /> Ya ves sus productos en tu buscador
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/search")}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
                    >
                      Ir a buscar
                    </button>
                  </div>
                ) : !store.open ? (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">La tienda no está abierta ahora. Probá más tarde.</p>
                ) : canManage === false ? (
                  <p className="rounded-lg bg-surface-800 px-3 py-2 text-xs text-surface-200">
                    Pedile al dueño o a un administrador de tu comercio que abra este link para sumar la tienda.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void accept()}
                      disabled={working}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                    >
                      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Ver sus productos en mi buscador
                    </button>
                    <p className="mt-2 text-[11px] leading-relaxed text-surface-500">
                      Es otro local, no un distribuidor: los pedidos los confirma {store.name} y el pago y la entrega los arreglan
                      entre ustedes. Lo podés sacar cuando quieras en Configuración → Tiendas de locales.
                    </p>
                  </>
                )}
                {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
