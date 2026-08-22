"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { airCheckoutApi, AirDraftResult, ProviderOption } from "@/lib/api";
import { CartItem } from "@/lib/cart";
import Link from "next/link";
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

export default function AirCheckoutPanel({
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

  const [sucursales, setSucursales] = useState<ProviderOption[]>([]);
  const [vendedores, setVendedores] = useState<ProviderOption[]>([]);
  const [pagos, setPagos] = useState<ProviderOption[]>([]);
  const [entregas, setEntregas] = useState<ProviderOption[]>([]);
  const [transportes, setTransportes] = useState<ProviderOption[]>([]);
  const [sucursal, setSucursal] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [pago, setPago] = useState("01");
  const [entrega, setEntrega] = useState("01");
  const [transporte, setTransporte] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<AirDraftResult>("AIR", "No se pudo enviar el pedido en Air");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await airCheckoutApi.options();
        if (cancelled) return;
        setSucursales(res.data.sucursales);
        setVendedores(res.data.vendedores);
        setPagos(res.data.pagos);
        setEntregas(res.data.entregas.filter((e) => e.value !== "05"));
        setTransportes(res.data.transportes);
        setSucursal(res.data.sucursales[0]?.value ?? "");
        setVendedor(res.data.vendedores[0]?.value ?? "");
        setPago(res.data.pagos[0]?.value ?? "01");
        setEntrega("01");
      } catch (err: unknown) {
        if (!cancelled) setError(errMessage(err, "No se pudieron cargar las opciones del canasto de Air."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const needsTransporte = entrega === "03" || entrega === "04";
  const canSubmit = Boolean(sucursal && vendedor && pago && entrega && !submitting && !loading);

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await airCheckoutApi.draft({
        items: cartItems,
        sucursal,
        vendedor,
        pago,
        entrega,
        transporte: needsTransporte ? transporte || undefined : undefined,
        notes: notes.trim() || undefined,
        background: true,
      });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo enviar el pedido en Air"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cargando canasto de Air…" />;
  if (error && sucursales.length === 0) {
    return (
      <CheckoutError href="/proveedores/AIR?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    );
  }

  const payLabel = pagos.find((p) => p.value === pago)?.label ?? pago;
  const delLabel = entregas.find((d) => d.value === entrega)?.label ?? entrega;
  const sucLabel = sucursales.find((s) => s.value === sucursal)?.label ?? sucursal;
  const venLabel = vendedores.find((v) => v.value === vendedor)?.label ?? vendedor;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 items-end">
        <CheckoutField label="Sucursal" htmlFor="air-suc">
          <CheckoutSelect id="air-suc" value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
            {sucursales.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Vendedor" htmlFor="air-ven">
          <CheckoutSelect id="air-ven" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            {vendedores.length === 0 && <option value="">Elegí un vendedor</option>}
            {vendedores.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutSubmit onClick={() => { setError(null); openConfirm(); }} disabled={!canSubmit}>
          Enviar a Air
        </CheckoutSubmit>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckoutField label="Pago" htmlFor="air-pago">
          <CheckoutSelect id="air-pago" value={pago} onChange={(e) => setPago(e.target.value)}>
            {pagos.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Entrega" htmlFor="air-ent">
          <CheckoutSelect id="air-ent" value={entrega} onChange={(e) => setEntrega(e.target.value)}>
            {entregas.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </CheckoutSelect>
        </CheckoutField>
      </div>
      {needsTransporte && (
        <CheckoutField label="Transporte" htmlFor="air-tr">
          <CheckoutSelect id="air-tr" value={transporte} onChange={(e) => setTransporte(e.target.value)}>
            <option value="">Seleccionar</option>
            {transportes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </CheckoutSelect>
        </CheckoutField>
      )}
      <CheckoutField label="Observaciones" htmlFor="air-nota">
        <CheckoutInput id="air-nota" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </CheckoutField>
      <p className="text-[11px] text-surface-500">
        Air no cobra desde Nodo: el canasto queda para que el vendedor lo cargue.
      </p>
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("AIR")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Air
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="AIR"
        title="Enviar canasto"
        warning="El vendedor elegido va a cargar el pedido en Air. No se cobra ni se factura desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Sucursal", value: sucLabel },
          { label: "Vendedor", value: venLabel },
          { label: "Pago", value: payLabel },
          { label: "Entrega", value: delLabel },
        ]}
        confirmLabel="Enviar a Air"
        loading={submitting}
        error={error || jobError}
        background={background}
        onBackgroundChange={setBackground}
        result={result ? { message: result.message, status: result.status, refs: [result.orderNumber].filter(Boolean) as string[] } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={() => finishOrder(onCreated)}
        onLeaveInBackground={leaveInBackground}
      />
    </div>
  );
}
