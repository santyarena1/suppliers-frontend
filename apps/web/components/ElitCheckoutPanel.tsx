"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  elitCheckoutApi,
  ElitCheckoutPreview,
  ElitDraftResult,
} from "@/lib/api";
import { CartItem, useCart } from "@/lib/cart";
import type { ElitUnavailableLine } from "@/lib/api";
import { PackageX } from "lucide-react";
import Link from "next/link";
import { formatUSD } from "@/lib/format";
import {
  CheckoutError,
  CheckoutField,
  CheckoutLoading,
  CheckoutSelect,
  CheckoutSubmit,
} from "@/components/checkout/CheckoutForm";
import OrderConfirmModal from "@/components/checkout/OrderConfirmModal";
import { providerOrdersHref } from "@/lib/providerOrders";
import { useBackgroundCheckout } from "@/lib/pendingOrders";
import { useCheckoutWarmup } from "@/lib/checkoutWarmup";
import { readPortalDrops, usePortalCartSync } from "@/lib/portalCartSync";
import PortalSyncNotice from "@/components/checkout/PortalSyncNotice";

/** Productos sin stock que la API informa con el error ELIT_NO_STOCK. */
function noStockFrom(code: unknown, details: unknown): ElitUnavailableLine[] {
  if (code !== "ELIT_NO_STOCK" || !details || typeof details !== "object") return [];
  const list = (details as { unavailable?: unknown }).unavailable;
  return Array.isArray(list) ? (list as ElitUnavailableLine[]) : [];
}

function noStockFromError(err: unknown): ElitUnavailableLine[] {
  const body = (err as { response?: { data?: { code?: unknown; details?: unknown } } })?.response?.data;
  return noStockFrom(body?.code, body?.details);
}

/** Solo un problema de cuenta o contraseña lleva a "Cargar cuenta". */
function looksLikeCredentials(message: string): boolean {
  return /credencial|contraseñ|usuario|login|iniciar sesi|autentic|nro\. de cliente|401|403/i.test(message);
}

function errMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(" · ");
  return msg || fallback;
}

export default function ElitCheckoutPanel({
  items,
  onCreated,
  onPreviewed,
}: {
  items: CartItem[];
  onCreated: (message?: string) => void;
  onPreviewed?: (preview: ElitCheckoutPreview | null) => void;
}) {
  const cartKey = items.map((it) => `${it.externalId}:${it.qty}`).join("|");
  const cartItems = useMemo(
    () => items.map((it) => ({ code: it.externalId, qty: it.qty, name: it.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey]
  );

  const [preview, setPreview] = useState<ElitCheckoutPreview | null>(null);
  const [warehouse, setWarehouse] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [saleCondition, setSaleCondition] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noStock, setNoStock] = useState<ElitUnavailableLine[]>([]);
  const { removeFromOrder } = useCart();
  const submitLock = useRef(false);
  const seeded = useRef<string | null>(null);
  const hydrated = useRef(false);
  const warm = useCheckoutWarmup("ELIT", cartItems);
  const portalSync = usePortalCartSync("ELIT", async (dropCodes) => {
    const res = await elitCheckoutApi.preview({
      items: cartItems,
      warehouse: warehouse ? Number(warehouse) : undefined,
      shippingMethod: shippingMethod ? Number(shippingMethod) : undefined,
      saleCondition: saleCondition ? Number(saleCondition) : undefined,
      shippingAddress: shippingAddress || undefined,
      dropPortalCodes: dropCodes,
    });
    return res.data.sync;
  });
  const {
    background, setBackground, result, confirmOpen, jobError, setConfirmOpen,
    openConfirm, acceptResult, leaveInBackground, finishOrder,
  } = useBackgroundCheckout<ElitDraftResult>("ELIT", "No se pudo crear el pedido en Elit");

  function publishPreview(data: ElitCheckoutPreview | null) {
    setPreview(data);
    setNoStock(data?.unavailable ?? []);
    onPreviewed?.(data);
    // Lo que cambió en el carrito de la cuenta de Elit se refleja acá.
    if (data) void portalSync.apply(data.sync, items, data.items);
  }

  useEffect(() => {
    seeded.current = null;
    hydrated.current = false;
    setLoading(true);
  }, [cartKey]);

  useEffect(() => {
    if (warm.itemsKey !== cartKey) return;
    if (warm.status === "ready" && warm.data && seeded.current !== cartKey) {
      seeded.current = cartKey;
      const data = warm.data.preview;
      publishPreview(data);
      setWarehouse(String(data.warehouse ?? data.warehouses[0]?.id ?? ""));
      setShippingMethod(data.shippingMethod ?? "");
      setSaleCondition(data.saleCondition ?? "");
      setShippingAddress(data.shippingAddress ?? data.addresses[0]?.code ?? "");
      setError(null);
      setLoading(false);
      hydrated.current = true;
      return;
    }
    if (warm.status === "error" && seeded.current !== cartKey) {
      publishPreview(null);
      setNoStock(noStockFrom(warm.errorCode, warm.errorDetails));
      setError(warm.error || "No se pudo armar el carrito de Elit.");
      setLoading(false);
      return;
    }
    if (warm.status === "loading" && seeded.current !== cartKey) {
      setLoading(true);
      setError(null);
    }
    // publishPreview is stable enough for this seed-once effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm, cartKey]);

  const methods = (preview?.shippingMethods ?? []).filter((m) => String(m.warehouse) === warehouse);
  const selectedPay = preview?.saleConditions.find((p) => p.value === saleCondition);
  const selectedShip = methods.find((m) => m.value === shippingMethod) ?? methods[0];
  const portalPending = portalSync.pending.length > 0;
  const canSubmit = Boolean(
    warehouse && (selectedShip || shippingMethod) && saleCondition && !submitting && !loading && !portalPending && noStock.length === 0
  );

  function dropFromCart(code: string) {
    for (const it of items) {
      if (it.externalId !== code) continue;
      removeFromOrder({ provider: it.provider, externalId: it.externalId, channel: it.channel, schemeId: it.schemeId });
    }
    setNoStock((prev) => prev.filter((line) => line.code !== code));
  }

  const noStockNotice = noStock.length > 0 && (
    <div role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
      <p className="flex items-center gap-2 font-semibold text-amber-50">
        <PackageX className="w-4 h-4 text-amber-300" />
        Elit no tiene stock de {noStock.length === 1 ? "este producto" : "estos productos"}
      </p>
      <p className="mt-0.5 text-amber-100/80">No entran en el pedido. Sacalos del carrito para poder confirmar.</p>
      <ul className="mt-2 space-y-1.5">
        {noStock.map((line) => (
          <li key={line.code} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              {line.name || line.code} <span className="text-amber-100/60">· {line.qty} u. · #{line.code}</span>
            </span>
            <button
              type="button"
              onClick={() => dropFromCart(line.code)}
              className="h-6 px-2 rounded-sm border border-amber-400/40 text-amber-50 hover:bg-amber-400/10"
            >
              Sacar del carrito
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  function payload() {
    return {
      items: cartItems,
      warehouse: Number(warehouse),
      shippingMethod: Number(selectedShip?.value || shippingMethod),
      saleCondition: Number(saleCondition),
      shippingAddress: shippingAddress || undefined,
      dropPortalCodes: readPortalDrops("ELIT"),
    };
  }

  useEffect(() => {
    if (!hydrated.current || !preview || loading) return;
    const same =
      Number(warehouse) === Number(preview.warehouse) &&
      String(selectedShip?.value || shippingMethod) === String(preview.shippingMethod ?? "") &&
      String(saleCondition) === String(preview.saleCondition ?? "") &&
      String(shippingAddress) === String(preview.shippingAddress ?? "");
    if (same) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await elitCheckoutApi.preview(payload());
        if (!cancelled) publishPreview(res.data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(errMessage(err, "No se pudo actualizar el carrito de Elit."));
          const missing = noStockFromError(err);
          if (missing.length > 0) setNoStock(missing);
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // payload/selectedShip change with preview; we only want user option changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse, shippingMethod, saleCondition, shippingAddress]);

  async function handleSubmit() {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const res = await elitCheckoutApi.draft({ ...payload(), background: true });
      acceptResult(res.data);
    } catch (err: unknown) {
      setError(errMessage(err, "No se pudo crear el pedido en Elit"));
      const missing = noStockFromError(err);
      if (missing.length > 0) setNoStock(missing);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <CheckoutLoading label="Cargando checkout Elit…" />;
  if (error && !preview) {
    if (noStockNotice) return <div className="flex flex-col gap-3">{noStockNotice}</div>;
    return looksLikeCredentials(error) ? (
      <CheckoutError href="/proveedores/ELIT?tab=credentials" hrefLabel="Cargar cuenta">
        {error}
      </CheckoutError>
    ) : (
      <CheckoutError>{error}</CheckoutError>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {noStockNotice}
      {portalSync.notice && portalSync.notice.lines.length > 0 && (
        <PortalSyncNotice
          providerLabel="Elit"
          notice={{ ...portalSync.notice, pending: [] }}
          busyCode={portalSync.busyCode}
          onKeep={portalSync.keep}
          onDrop={portalSync.drop}
          onDismiss={portalSync.dismiss}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 items-end">
        <CheckoutField label="Depósito" htmlFor="elit-wh">
          <CheckoutSelect id="elit-wh" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            {(preview?.warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Entrega" htmlFor="elit-ship">
          <CheckoutSelect id="elit-ship" value={selectedShip?.value ?? shippingMethod} onChange={(e) => setShippingMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}{m.cost ? ` · USD ${m.cost}` : " · sin cargo"}
              </option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutSubmit
          onClick={() => { setError(null); openConfirm(); }}
          disabled={!canSubmit}
          title={
            noStock.length > 0
              ? "Sacá del carrito lo que Elit no tiene en stock"
              : portalPending
                ? "Decidí si dejás o sacás lo que ya estaba en el carrito de Elit"
                : undefined
          }
        >
          Confirmar Elit
        </CheckoutSubmit>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckoutField label="Pago" htmlFor="elit-pay">
          <CheckoutSelect id="elit-pay" value={saleCondition} onChange={(e) => setSaleCondition(e.target.value)}>
            {(preview?.saleConditions ?? []).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.surcharge ? ` · +${p.surcharge}%` : ""}
              </option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
        <CheckoutField label="Dirección" htmlFor="elit-addr">
          <CheckoutSelect id="elit-addr" value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)}>
            {(preview?.addresses ?? []).map((a) => (
              <option key={a.code} value={a.code}>{a.addressLine || a.label}</option>
            ))}
          </CheckoutSelect>
        </CheckoutField>
      </div>
      {preview && (
        <p className="text-[11px] text-surface-500 tabular-nums">
          Neto {formatUSD(preview.subtotal)}
          {preview.vat ? ` · IVA ${formatUSD(preview.vat)}` : ""}
          {(preview.perceptionLines?.length
            ? preview.perceptionLines
            : preview.perceptions
              ? [{ label: "Percepciones", amount: preview.perceptions }]
              : []
          ).map((line) => ` · ${line.label} ${formatUSD(line.amount)}`).join("")}
          {selectedShip?.cost ? ` · Envío ${formatUSD(selectedShip.cost)}` : ""}
          {" · "}Total {formatUSD(preview.total)}
        </p>
      )}
      {(error || jobError) && !confirmOpen && <CheckoutError>{error || jobError}</CheckoutError>}
      <p className="text-[11px] text-surface-600">
        <Link href={providerOrdersHref("ELIT")} className="hover:text-surface-300 underline underline-offset-2">
          Ver historial de Elit
        </Link>
      </p>
      <OrderConfirmModal
        open={confirmOpen}
        provider="ELIT"
        title="Confirmar pedido"
        warning="Esto crea la nota de venta real en tu cuenta de Elit. No se puede deshacer desde Nodo."
        items={items.map((it) => ({ name: it.name, qty: it.qty }))}
        lines={[
          { label: "Depósito", value: preview?.warehouses.find((w) => String(w.id) === warehouse)?.name ?? warehouse },
          { label: "Entrega", value: selectedShip?.label ?? "—" },
          { label: "Pago", value: selectedPay?.label ?? "—" },
          { label: "Líneas", value: String(items.length) },
          ...(preview?.perceptionLines ?? []).map((line) => ({
            label: line.label,
            value: formatUSD(line.amount),
          })),
        ]}
        confirmLabel="Procesar en Elit"
        loading={submitting}
        error={error || jobError}
        background={background}
        onBackgroundChange={setBackground}
        result={result ? {
          message: result.message,
          status: result.status,
          refs: [result.orderNumber && `Pedido ${result.orderNumber}`, result.total != null && `Total ${formatUSD(Number(result.total))}`].filter(Boolean) as string[],
        } : null}
        onCancel={() => { if (!submitting) setConfirmOpen(false); }}
        onConfirm={handleSubmit}
        onDone={() => finishOrder(onCreated)}
        onLeaveInBackground={leaveInBackground}
      />
    </div>
  );
}
