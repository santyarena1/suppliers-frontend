"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  grupoNucleoCheckoutApi,
  GnCheckoutPreview,
  GnDraftResult,
} from "@/lib/api";
import { CartItem } from "@/lib/cart";
import Link from "next/link";
import { formatUSD } from "@/lib/format";
import {
  CheckoutError,
  CheckoutField,
  CheckoutInput,
  CheckoutLoading,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import OrderConfirmModal from "@/components/checkout/OrderConfirmModal";
import { providerOrdersHref } from "@/lib/providerOrders";
import { useBackgroundCheckout } from "@/lib/pendingOrders";

function errMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" · ");
  return msg || fallback;
}

export default function GrupoNucleoCheckoutPanel({
  items,
  onCreated,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<GnCheckoutPreview | null>(null);
  const [customerSale, setCustomerSale] = useState(false);
  const [notes, setNotes] = useState("");
  const [provinces, setProvinces] = useState<{ value: number; label: string }[]>([]);
  const [docTypes, setDocTypes] = useState<{ value: string; label: string }[]>([]);
  const [customer, setCustomer] = useState({
    nombre: "", documento: "", tipoDocumento: 80, direccion: "",
    codigoPostal: "", ciudad: "", codProvincia: 1, email: "", tel: "",
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<GnDraftResult>("GRUPO_NUCLEO", "No se pudo crear el pedido en Grupo Núcleo");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [opt, prev] = await Promise.all([
          grupoNucleoCheckoutApi.options(),
          grupoNucleoCheckoutApi.preview({ items: cartItems, customerSale }),
        ]);
        if (cancelled) return;
        setProvinces(opt.data.provinces);
        setDocTypes(opt.data.documentTypes.map((d) => ({ value: String(d.value), label: d.label })));
        setPreview(prev.data);
      } catch (err: unknown) {
        if (!cancelled) setError(errMessage(err, "No se pudo validar stock/precio en Grupo Núcleo."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cartItems, customerSale]);

  const canSubmit = !loading && !submitting && Boolean(preview?.stockOk) && (
    !customerSale || Boolean(customer.nombre && customer.documento && customer.direccion && customer.codigoPostal && customer.ciudad && customer.email && customer.tel)
  );

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await grupoNucleoCheckoutApi.draft({
        items: cartItems,
        notes: notes.trim() || undefined,
        customerSale,
        customer: customerSale ? customer : undefined,
        background: true,
      });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en Grupo Núcleo"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Validando stock y precio en Grupo Núcleo…" />;
  if (error && !preview) {
    return (
      <CheckoutError href="/proveedores/GRUPO_NUCLEO?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-end">
        <CheckoutField label="Factura">
          <div className="flex h-10 items-center gap-2 px-3 border border-surface-700/90 rounded-sm text-sm text-surface-300">
            <input type="checkbox" className="accent-white" checked={customerSale} onChange={(e) => setCustomerSale(e.target.checked)} />
            A nombre del cliente final
          </div>
        </CheckoutField>
        <CheckoutField label="Nota" htmlFor="gn-nota">
          <CheckoutInput id="gn-nota" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </CheckoutField>
        <CheckoutSubmit
          onClick={() => { setError(null); openConfirm(); }}
          disabled={!canSubmit}
        >
          Confirmar Núcleo
        </CheckoutSubmit>
      </div>
      {customerSale && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CheckoutField label="Nombre" htmlFor="gn-nom">
            <CheckoutInput id="gn-nom" value={customer.nombre} onChange={(e) => setCustomer({ ...customer, nombre: e.target.value })} />
          </CheckoutField>
          <CheckoutField label="Documento" htmlFor="gn-doc">
            <CheckoutInput id="gn-doc" value={customer.documento} onChange={(e) => setCustomer({ ...customer, documento: e.target.value })} />
          </CheckoutField>
          <CheckoutField label="Tipo doc." htmlFor="gn-tipo">
            <CheckoutSelect id="gn-tipo" value={String(customer.tipoDocumento)} onChange={(e) => setCustomer({ ...customer, tipoDocumento: Number(e.target.value) })}>
              {docTypes.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </CheckoutSelect>
          </CheckoutField>
          <CheckoutField label="Dirección" htmlFor="gn-dir">
            <CheckoutInput id="gn-dir" value={customer.direccion} onChange={(e) => setCustomer({ ...customer, direccion: e.target.value })} />
          </CheckoutField>
          <CheckoutField label="CP" htmlFor="gn-cp">
            <CheckoutInput id="gn-cp" value={customer.codigoPostal} onChange={(e) => setCustomer({ ...customer, codigoPostal: e.target.value })} />
          </CheckoutField>
          <CheckoutField label="Ciudad" htmlFor="gn-ciu">
            <CheckoutInput id="gn-ciu" value={customer.ciudad} onChange={(e) => setCustomer({ ...customer, ciudad: e.target.value })} />
          </CheckoutField>
          <CheckoutField label="Provincia" htmlFor="gn-prov">
            <CheckoutSelect id="gn-prov" value={String(customer.codProvincia)} onChange={(e) => setCustomer({ ...customer, codProvincia: Number(e.target.value) })}>
              {provinces.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </CheckoutSelect>
          </CheckoutField>
          <CheckoutField label="Email" htmlFor="gn-mail">
            <CheckoutInput id="gn-mail" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
          </CheckoutField>
          <CheckoutField label="Teléfono" htmlFor="gn-tel">
            <CheckoutInput id="gn-tel" value={customer.tel} onChange={(e) => setCustomer({ ...customer, tel: e.target.value })} />
          </CheckoutField>
        </div>
      )}
      {preview && (
        <p className="text-[11px] text-surface-500">
          {preview.stockOk ? "Stock OK" : "Hay ítems sin stock suficiente"}
          {" · "}Neto {formatUSD(preview.subtotalUsd)}
          {preview.usdExchange ? ` · USD GN ${preview.usdExchange}` : ""}
          . El envío se pacta con Núcleo aparte.
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("GRUPO_NUCLEO")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Grupo Núcleo
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="GRUPO_NUCLEO"
        title="Confirmar pedido"
        warning={customerSale
          ? "Crea el pedido real a nombre del cliente final (NewCustomerSaleOrder)."
          : "Crea el pedido real a tu nombre (NewSelfSaleOrder). Un pedido por centro de distribución."}
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Factura", value: customerSale ? "Cliente final" : "A mi nombre" },
          { label: "Líneas", value: String(items.length) },
          { label: "Neto USD", value: preview ? formatUSD(preview.subtotalUsd) : "—" },
        ]}
        confirmLabel="Procesar en Núcleo"
        loading={submitting}
        error={error || jobError}
        background={background}
        onBackgroundChange={setBackground}
        result={result ? {
          message: result.message,
          status: result.status,
          refs: [result.webOrderNumber, result.orderNumber].filter(Boolean) as string[],
        } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={() => finishOrder(onCreated)}
        onLeaveInBackground={leaveInBackground}
      />
    </div>
  );
}
