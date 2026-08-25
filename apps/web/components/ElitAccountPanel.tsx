"use client";

import { useEffect, useState } from "react";
import {
  elitAccountApi,
  elitCheckoutApi,
  NodoProviderDraft,
  ElitSaleNote,
  ElitMovement,
  ElitPayment,
  uploadAuthedFile,
} from "@/lib/api";
import { loadAccountCached, clearAccountCache } from "@/lib/account-portal-cache";
import NodoSpinner from "@/components/NodoSpinner";
import { Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import AccountRowDetail, { VerMasButton, type AccountDetailDoc } from "@/components/account/AccountRowDetail";
import { draftItems, draftLines } from "@/components/account/draftDetail";
import { CheckoutField, CheckoutGhostButton, CheckoutInput, CheckoutSelect, CheckoutSubmit } from "@/components/checkout/CheckoutForm";
import AccountHistoryChrome from "@/components/account/AccountHistoryChrome";
import {
  useAccountHistoryState,
  useClampPage,
  usePagedMonthRows,
} from "@/components/account/useAccountHistory";

type ElitAccount = Awaited<ReturnType<typeof elitAccountApi.account>>["data"];
type Detail =
  | { kind: "order"; row: ElitSaleNote }
  | { kind: "movement"; row: ElitMovement }
  | { kind: "draft"; row: NodoProviderDraft }
  | { kind: "payment"; row: ElitPayment };

type SectionId = "cta" | "payments" | "nodo" | "orders";

type CachedPayload = { account: ElitAccount; drafts: NodoProviderDraft[] };

const SECTIONS = [
  { id: "cta", label: "Cuenta corriente" },
  { id: "payments", label: "Informes de pago" },
  { id: "nodo", label: "Desde Nodo" },
  { id: "orders", label: "Notas de venta" },
] as const;

export default function ElitAccountPanel() {
  const history = useAccountHistoryState("cta");
  const [account, setAccount] = useState<ElitAccount | null>(null);
  const [drafts, setDrafts] = useState<NodoProviderDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailNote, setDetailNote] = useState<ElitSaleNote | null>(null);

  useEffect(() => {
    void load(false);
  }, []);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (refresh) clearAccountCache("ELIT:");
      const { data, fromCache: hit } = await loadAccountCached<CachedPayload>(
        "ELIT:account",
        async () => {
          const [accountRes, draftsRes] = await Promise.all([
            elitAccountApi.account({ refresh }),
            elitCheckoutApi.drafts().catch(() => ({ data: [] as NodoProviderDraft[] })),
          ]);
          return {
            account: accountRes.data,
            drafts: draftsRes.data ?? accountRes.data.drafts ?? [],
          };
        },
        { refresh }
      );
      setAccount(data.account);
      setDrafts(data.drafts);
      setFromCache(hit);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo traer Pedidos/Cta. Cte. de Elit. ¿Están el nº de cliente y la contraseña del portal?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (detail?.kind !== "order") {
      setDetailNote(null);
      return;
    }
    const number = detail.row.orderNumber;
    if (!number || (detail.row.items && detail.row.items.length > 0)) {
      setDetailNote(detail.row);
      return;
    }
    void elitAccountApi.saleNote(number).then((res) => setDetailNote(res.data)).catch(() => setDetailNote(detail.row));
  }, [detail]);

  const section = history.section as SectionId;
  const rowsForSection =
    section === "cta"
      ? account?.movements ?? null
      : section === "payments"
        ? account?.payments ?? null
        : section === "nodo"
          ? drafts
          : account?.orders ?? null;

  const getDate =
    section === "cta"
      ? (m: ElitMovement) => m.date
      : section === "payments"
        ? (p: ElitPayment) => p.date
        : section === "nodo"
          ? (d: NodoProviderDraft) => d.createdAt
          : (o: ElitSaleNote) => o.date;

  const paged = usePagedMonthRows(
    rowsForSection as never[],
    getDate as never,
    history.month,
    history.page
  );
  useClampPage(history.page, paged.pages, history.setPage);

  const openOrder = detail?.kind === "order" ? (detailNote ?? detail.row) : null;
  const ready = account != null && drafts != null;

  return (
    <>
      {account?.profile?.name && (
        <p className="text-xs text-surface-400 mb-3 max-w-3xl">
          {account.profile.name}
          {account.profile.id ? ` · cliente ${account.profile.id}` : ""}
          {account.profile.exchange != null ? ` · USD ${account.profile.exchange}` : ""}
        </p>
      )}

      <AccountHistoryChrome
        sections={[...SECTIONS]}
        section={section}
        onSection={(id) => history.setSection(id)}
        month={history.month}
        onMonth={history.setMonth}
        page={paged.page}
        pages={paged.pages}
        total={paged.total}
        onPage={history.setPage}
        onRefresh={() => void load(true)}
        refreshing={loading}
        fromCache={fromCache}
        hint="Pedidos, comprobantes e informes de pago de tu cuenta en elit.com.ar. Mes actual por defecto, de a 25. Actualizar vuelve a consultar el portal."
        header={
          section === "cta" && account?.balance != null ? (
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">Saldo</span>
                <p className={`text-xl font-bold tabular-nums ${account.balance < 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {account.balance.toLocaleString("es-AR", { style: "currency", currency: "USD" })}
                </p>
              </div>
            </div>
          ) : undefined
        }
      >
        {loading && !ready ? (
          <div className="flex justify-center py-10"><NodoSpinner className="w-6 h-6" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">
              {error}{" "}
              <Link href="/proveedores/ELIT?tab=credentials" className="underline text-red-300 hover:text-white">
                Cargar cuenta
              </Link>
            </span>
            <button type="button" onClick={() => void load(true)} className="underline flex-shrink-0">Reintentar</button>
          </div>
        ) : section === "cta" ? (
          <MovementsTable
            rows={paged.items as ElitMovement[]}
            onOpen={(m) => setDetail({ kind: "movement", row: m })}
          />
        ) : section === "payments" ? (
          <ElitPaymentSection
            payments={paged.items as ElitPayment[]}
            canCreate={account?.canCreateReport}
            onOpen={(p) => setDetail({ kind: "payment", row: p })}
            onDone={() => void load(true)}
          />
        ) : section === "nodo" ? (
          <DraftsTable
            drafts={paged.items as NodoProviderDraft[]}
            onOpen={(d) => setDetail({ kind: "draft", row: d })}
          />
        ) : (
          <OrdersTable
            rows={paged.items as ElitSaleNote[]}
            onOpen={(o) => setDetail({ kind: "order", row: o })}
          />
        )}
      </AccountHistoryChrome>

      {detail?.kind === "order" && openOrder && (
        <AccountRowDetail
          open
          title={`Nota de venta ${openOrder.orderNumber}`}
          lines={[
            { label: "Estado", value: openOrder.status },
            { label: "Detalle", value: openOrder.statusDescription || "" },
            { label: "Factura", value: openOrder.invoiceNumber },
            { label: "Fecha", value: openOrder.date },
            { label: "Depósito", value: openOrder.warehouseName || "" },
            { label: "Condición", value: openOrder.saleCondition || "" },
            { label: "Envío", value: openOrder.shippingMethod || "" },
            { label: "Tracking", value: [openOrder.trackingSupplier, openOrder.tracking, openOrder.trackingStatus].filter(Boolean).join(" · ") },
            { label: "Importe", value: fmt(openOrder.amount, openOrder.currency) },
          ]}
          items={(openOrder.items ?? []).map((it) => ({
            code: it.code,
            name: it.name || it.code || "Ítem",
            qty: it.quantity ?? undefined,
            price: it.price ?? undefined,
            total: it.total ?? undefined,
          }))}
          documents={elitOrderDocs(openOrder)}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "movement" && (
        <AccountRowDetail
          open
          title={`${detail.row.form} ${detail.row.number}`.trim()}
          lines={[
            { label: "Tipo", value: detail.row.form },
            { label: "Número", value: detail.row.number },
            { label: "Fecha", value: detail.row.date },
            { label: "Débito", value: fmt(detail.row.debit, detail.row.currency) },
            { label: "Crédito", value: fmt(detail.row.credit, detail.row.currency) },
            { label: "Saldo", value: fmt(detail.row.balanceUsd ?? detail.row.balance, detail.row.currency) },
          ]}
          documents={elitMovementDocs(detail.row)}
          note={/saldo/i.test(detail.row.form) ? "El saldo no es un comprobante descargable." : undefined}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "draft" && (
        <AccountRowDetail
          open
          title="Pedido desde Nodo"
          lines={draftLines(detail.row)}
          items={draftItems(detail.row)}
          onClose={() => setDetail(null)}
        />
      )}
      {detail?.kind === "payment" && (
        <AccountRowDetail
          open
          title={`Informe ${detail.row.id}`}
          lines={[
            { label: "Id", value: detail.row.id },
            { label: "Fecha", value: detail.row.date },
            { label: "Estado", value: detail.row.status },
            { label: "Total", value: detail.row.total != null ? String(detail.row.total) : "" },
            { label: "Aprobado", value: detail.row.totalApproved != null ? String(detail.row.totalApproved) : "" },
          ]}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function elitOrderDocs(o: ElitSaleNote): AccountDetailDoc[] {
  const docs: AccountDetailDoc[] = [];
  if (o.pdfUrl || o.orderNumber) {
    docs.push({
      label: "Descargar nota de venta",
      href: `/providers/ELIT/documents?form=${encodeURIComponent(o.form || "NOTA DE VENTA")}&number=${encodeURIComponent(o.orderNumber)}&kind=salenote`,
      filename: `nv-${o.orderNumber}.pdf`,
    });
  }
  if (o.dispatchNotePdfUrl) {
    docs.push({
      label: "Descargar remito",
      href: `/providers/ELIT/documents?form=${encodeURIComponent(o.form || "NOTA DE VENTA")}&number=${encodeURIComponent(o.orderNumber)}&kind=dispatch`,
      filename: `remito-${o.orderNumber}.pdf`,
    });
  }
  if (o.invoiceNumber) {
    docs.push({
      label: "Descargar factura",
      href: `/providers/ELIT/documents?form=${encodeURIComponent("FACTURA A")}&number=${encodeURIComponent(o.invoiceNumber)}`,
      filename: `factura-${o.invoiceNumber}.pdf`,
    });
  }
  return docs;
}

function elitMovementDocs(m: ElitMovement): AccountDetailDoc[] {
  if (!m.number || /saldo/i.test(m.form)) return [];
  return [{
    label: `Descargar ${m.form}`,
    href: `/providers/ELIT/documents?form=${encodeURIComponent(m.form)}&number=${encodeURIComponent(m.number)}`,
    filename: `${m.form}-${m.number}.pdf`,
  }];
}

function fmt(n: number | null | undefined, currency?: string) {
  if (n == null) return "—";
  const code = currency === "ARS" ? "ARS" : "USD";
  return n.toLocaleString("es-AR", { style: "currency", currency: code, maximumFractionDigits: 2 });
}

function statusClass(status: string) {
  if (/cerrad|entreg|factur|complet|aprob/i.test(status)) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (/cancel|anul|vencid/i.test(status)) return "bg-red-500/10 text-red-400";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function MovementsTable({
  rows,
  onOpen,
}: {
  rows: ElitMovement[];
  onOpen: (m: ElitMovement) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-left font-semibold px-2 py-2">Tipo</th>
            <th className="text-left font-semibold px-2 py-2">Número</th>
            <th className="text-right font-semibold px-2 py-2">Débito</th>
            <th className="text-right font-semibold px-2 py-2">Crédito</th>
            <th className="text-right font-semibold px-2 py-2">Saldo</th>
            <th className="text-right font-semibold px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((m, i) => (
            <tr key={`${m.number}-${i}`}>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{m.date || "—"}</td>
              <td className="px-2 py-2 text-surface-200">{m.form || "—"}</td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{m.number || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.debit, m.currency)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.credit, m.currency)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(m.balanceUsd ?? m.balance, m.currency)}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(m)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin movimientos en este período.</p>
      )}
    </div>
  );
}

function OrdersTable({
  rows,
  onOpen,
}: {
  rows: ElitSaleNote[];
  onOpen: (o: ElitSaleNote) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">N°</th>
            <th className="text-left font-semibold px-2 py-2">Factura</th>
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Depósito</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-right font-semibold px-2 py-2">Importe</th>
            <th className="text-right font-semibold px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {rows.map((o, i) => (
            <tr key={`${o.orderNumber}-${i}`}>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.orderNumber || "—"}</td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{o.invoiceNumber || "—"}</td>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass(o.status)}`}>{o.status || "—"}</span>
              </td>
              <td className="px-2 py-2 text-surface-400">{o.warehouseName || "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{o.date || "—"}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{fmt(o.amount, o.currency)}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(o)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Sin notas de venta en este período.</p>
      )}
    </div>
  );
}

function DraftsTable({ drafts, onOpen }: { drafts: NodoProviderDraft[]; onOpen: (d: NodoProviderDraft) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-surface-500">
            <th className="text-left font-semibold px-2 py-2">Estado</th>
            <th className="text-left font-semibold px-2 py-2">Pedido</th>
            <th className="text-left font-semibold px-2 py-2">Fecha</th>
            <th className="text-right font-semibold px-2 py-2">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-800">
          {drafts.map((d) => (
            <tr key={d.id}>
              <td className="px-2 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  d.status === "CREATED" ? "bg-sky-500/10 text-sky-400" : "bg-red-500/10 text-red-400"
                }`}>{d.status === "CREATED" ? "Creado" : d.status}</span>
              </td>
              <td className="px-2 py-2 text-surface-400 font-mono text-xs">{d.invidOrderNumber ?? d.invidWebOrderNumber ?? "—"}</td>
              <td className="px-2 py-2 text-surface-400 whitespace-nowrap">{new Date(d.createdAt).toLocaleString("es-AR")}</td>
              <td className="px-2 py-2 text-right tabular-nums text-surface-200">{d.total ?? "—"}</td>
              <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(d)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {drafts.length === 0 && (
        <p className="text-center text-xs text-surface-500 py-6">Todavía no creaste pedidos desde Nodo en este período.</p>
      )}
    </div>
  );
}

function pickOpId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const nested = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : rec;
  const id = nested.id ?? nested._id ?? rec.id ?? rec._id;
  return id != null ? String(id) : undefined;
}

function ElitPaymentSection({
  payments,
  canCreate,
  onOpen,
  onDone,
}: {
  payments: ElitPayment[];
  canCreate?: boolean;
  onOpen: (p: ElitPayment) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<{ id?: number; name: string }[]>([]);
  const [operations, setOperations] = useState<{ bank?: number; code?: string; name?: string }[]>([]);
  const [bankId, setBankId] = useState("");
  const [opCode, setOpCode] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [number, setNumber] = useState("");
  const [opId, setOpId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadOptions() {
    setOpen(true);
    setErr(null);
    try {
      const res = await elitAccountApi.paymentOptions();
      setBanks(res.data.banks);
      setOperations(res.data.operations);
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(m || "No se pudieron cargar bancos/operaciones de Elit");
    }
  }

  const opsForBank = operations.filter((o) => !bankId || String(o.bank) === bankId);
  const selectedBank = banks.find((b) => String(b.id) === bankId);
  const selectedOp = opsForBank.find((o) => o.code === opCode) ?? operations.find((o) => o.code === opCode);

  async function createOp() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const body = {
        type: selectedOp?.code || opCode || undefined,
        bank: selectedBank?.id ?? (bankId ? Number(bankId) : undefined),
        bankName: selectedBank?.name,
        operationName: selectedOp?.name,
        date: date || undefined,
        amount: amount ? Number(amount) : undefined,
        number: number || undefined,
      };
      const res = await elitAccountApi.createOperation(body);
      let id = pickOpId(res.data);
      if (!id) {
        const list = await elitAccountApi.payments();
        id = pickOpId(list.data.active);
      }
      if (!id) throw new Error("Elit creó la operación pero no devolvió un id. Revisá Informes de pago en su sitio.");
      setOpId(id);
      setMsg(`Operación ${id} creada. Ahora adjuntá el comprobante.`);
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(m || (e instanceof Error ? e.message : "No se pudo crear la operación"));
    } finally {
      setBusy(false);
    }
  }

  async function attach(file: File) {
    if (!opId) return;
    setBusy(true);
    setErr(null);
    try {
      await uploadAuthedFile(`/providers/ELIT/payments/operation/${encodeURIComponent(opId)}/attach`, file);
      setMsg("Comprobante adjunto. Cerrá el informe para mandarlo.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "No se pudo adjuntar");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      await elitAccountApi.finishPayment();
      setMsg("Informe enviado.");
      setOpId(null);
      onDone();
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(m || "No se pudo cerrar el informe");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-surface-500">
        Subí el comprobante acá para no entrar a Elit. No se abre un informe vacío: primero elegís banco, tipo, fecha e importe.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-surface-500">
              <th className="text-left font-semibold px-2 py-2">Id</th>
              <th className="text-left font-semibold px-2 py-2">Fecha</th>
              <th className="text-left font-semibold px-2 py-2">Estado</th>
              <th className="text-right font-semibold px-2 py-2">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-2 py-2 font-mono text-xs text-surface-400">{p.id}</td>
                <td className="px-2 py-2 text-surface-400">{p.date || "—"}</td>
                <td className="px-2 py-2 text-surface-200">{p.status || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{p.total ?? "—"}</td>
                <td className="px-2 py-2 text-right"><VerMasButton onClick={() => onOpen(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="text-center text-xs text-surface-500 py-4">Sin informes en este período.</p>}
      </div>
      {canCreate !== false && (
        <CheckoutGhostButton type="button" onClick={loadOptions}>Nuevo informe</CheckoutGhostButton>
      )}
      {open && (
        <div className="grid gap-3 sm:grid-cols-2 border-t border-surface-800 pt-4">
          <CheckoutField label="Banco">
            <CheckoutSelect value={bankId} onChange={(e) => { setBankId(e.target.value); setOpCode(""); }}>
              <option value="">Elegí banco</option>
              {banks.map((b) => (
                <option key={String(b.id ?? b.name)} value={b.id != null ? String(b.id) : ""}>{b.name}</option>
              ))}
            </CheckoutSelect>
          </CheckoutField>
          <CheckoutField label="Tipo">
            <CheckoutSelect value={opCode} onChange={(e) => setOpCode(e.target.value)}>
              <option value="">Elegí operación</option>
              {opsForBank.map((o) => (
                <option key={String(o.code)} value={o.code || ""}>{o.name}</option>
              ))}
            </CheckoutSelect>
          </CheckoutField>
          <CheckoutField label="Fecha">
            <CheckoutInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </CheckoutField>
          <CheckoutField label="Importe">
            <CheckoutInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </CheckoutField>
          <CheckoutField label="N° operación" className="sm:col-span-2">
            <CheckoutInput value={number} onChange={(e) => setNumber(e.target.value)} />
          </CheckoutField>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <CheckoutSubmit type="button" loading={busy} disabled={busy || !opCode} onClick={createOp}>
              Crear operación
            </CheckoutSubmit>
            {opId && (
              <>
                <label className="h-10 px-3 inline-flex items-center text-xs border border-surface-700 text-surface-200 rounded-sm cursor-pointer">
                  Adjuntar archivo
                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); }} />
                </label>
                <CheckoutGhostButton type="button" loading={busy} disabled={busy} onClick={finish}>Cerrar informe</CheckoutGhostButton>
              </>
            )}
          </div>
          {msg && <p className="sm:col-span-2 text-xs text-emerald-400">{msg}</p>}
          {err && <p className="sm:col-span-2 text-xs text-red-400">{err}</p>}
        </div>
      )}
    </div>
  );
}
