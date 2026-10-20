"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Clock, Loader2 } from "lucide-react";
import type { MyStorefront } from "@/lib/api";

type StoreView = Extract<MyStorefront, { exists: true }>;
type Tab = "productos" | "pedidos" | "datos";

/** done = cumplido · todo = falta y frena · warn = se ve igual, pero conviene · waiting = depende de otros · blocked = falta lo anterior. */
type ItemState = "done" | "todo" | "warn" | "waiting" | "blocked";

type Action =
  | { kind: "tab"; tab: Tab; label: string }
  | { kind: "href"; href: string; label: string }
  | { kind: "reactivate"; label: string }
  | { kind: "confirm"; label: string };

interface Item {
  key: string;
  title: string;
  state: ItemState;
  detail: string;
  action?: Action;
}

const STATE_ICON: Record<ItemState, { icon: typeof Circle; cls: string; label: string }> = {
  done: { icon: CheckCircle2, cls: "text-emerald-300", label: "Listo" },
  todo: { icon: Circle, cls: "text-amber-300", label: "Falta" },
  warn: { icon: AlertTriangle, cls: "text-amber-300", label: "Conviene" },
  waiting: { icon: Clock, cls: "text-sky-300", label: "Esperando" },
  blocked: { icon: Circle, cls: "text-surface-600", label: "Después" },
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Estado de la tienda (abierta, pausada, cerrada, frenada) como requisito. */
function openItem(store: StoreView): Item {
  const base = { key: "open", title: "Tienda abierta" };
  if (store.hiddenReason === "OWNER_INACTIVE") return { ...base, state: "todo", detail: "Tu comercio está inactivo en NODO. Escribinos para reactivarlo." };
  switch (store.status) {
    case "PAUSED":
      return { ...base, state: "todo", detail: "La pausaste: nadie la ve ni te puede pedir.", action: { kind: "reactivate", label: "Reactivar tienda" } };
    case "CLOSED":
      return { ...base, state: "todo", detail: "La cerraste. Abrila con «Abrir la tienda», arriba: vuelve con tus productos." };
    case "SUSPENDED":
      return { ...base, state: "todo", detail: `NODO la frenó${store.suspendedReason ? `: ${store.suspendedReason}` : ""}. Escribinos para revisarlo.` };
    default:
      return { ...base, state: "done", detail: "Abierta: recibe pedidos." };
  }
}

function importItem(store: StoreView): Item | null {
  const last = store.latestImport;
  if (!last || (last.status !== "NEEDS_REVIEW" && last.status !== "FAILED")) return null;
  const href = `/vender/listas/${last.id}`;
  return last.status === "NEEDS_REVIEW"
    ? {
        key: "import",
        title: "Última planilla aplicada",
        state: "todo",
        detail: `«${last.fileName}» quedó en revisión: hasta que la apliques, tus productos siguen como estaban.`,
        action: { kind: "href", href, label: "Revisar la carga" },
      }
    : {
        key: "import",
        title: "Última planilla aplicada",
        state: "todo",
        detail: `«${last.fileName}» no se pudo cargar${last.error ? `: ${last.error}` : ""}.`,
        action: { kind: "href", href, label: "Ver qué pasó" },
      };
}

/** Confirmar el stock solo frena si el dueño eligió ocultar la tienda al vencer. */
function stockConfirmItem(store: StoreView): Item | null {
  if (store.stockValidDays === 0 || store.productCount === 0) return null;
  const fresh = store.stockState === "FRESH" || store.stockState === "DUE_SOON";
  const base = { key: "confirm", title: "Stock confirmado", action: fresh ? undefined : ({ kind: "confirm", label: "Mi stock está al día" } as const) };
  if (fresh) return { ...base, state: "done", detail: "Confirmado y vigente." };
  const never = store.stockState === "UNCONFIRMED";
  return store.staleAction === "HIDE"
    ? {
        ...base,
        state: "todo",
        detail: `${never ? "Nunca lo confirmaste" : "Venció la confirmación"} y elegiste que la tienda se oculte: confirmalo para que aparezca.`,
      }
    : {
        ...base,
        state: "warn",
        detail: `La tienda se ve igual, pero los compradores leen que ${never ? "todavía no confirmaste el stock" : "no confirmás el stock hace rato"}.`,
      };
}

function audienceItem(store: StoreView, readyToShow: boolean): Item {
  const { accepted, pending, declined } = store.audience;
  const base = { key: "audience", title: "Comercios que la ven" };
  if (store.visibility === "PRIVATE") {
    return accepted > 0
      ? { ...base, state: "done", detail: `Es privada: ${plural(accepted, "comercio entró", "comercios entraron")} con tu link.` }
      : {
          ...base,
          state: "todo",
          detail: "Es privada: solo la ven los comercios a los que les pases tu link de invitación, y todavía nadie entró.",
          action: { kind: "tab", tab: "datos", label: "Copiar el link" },
        };
  }
  if (accepted > 0) {
    return {
      ...base,
      state: "done",
      detail: `${plural(accepted, "comercio la aceptó y la ve", "comercios la aceptaron y la ven")} en su buscador${
        pending > 0 ? `; ${plural(pending, "todavía no respondió", "todavía no respondieron")}` : ""
      }.`,
    };
  }
  if (!readyToShow) {
    return {
      ...base,
      state: "blocked",
      detail: "Apenas esté lo de arriba, se la ofrecemos a todos los comercios de NODO. La ve cada uno que la acepta.",
    };
  }
  if (pending > 0) {
    return {
      ...base,
      state: "waiting",
      detail: `Se la ofrecimos a ${plural(pending, "comercio", "comercios")} y todavía no respondieron. Para no esperar, pasales tu link de invitación.`,
      action: { kind: "tab", tab: "datos", label: "Copiar el link" },
    };
  }
  return {
    ...base,
    state: "waiting",
    detail: `Nadie la aceptó todavía${declined > 0 ? ` (${plural(declined, "comercio prefirió", "comercios prefirieron")} no verla)` : ""}. Pasá tu link de invitación a los comercios con los que trabajás.`,
    action: { kind: "tab", tab: "datos", label: "Copiar el link" },
  };
}

/** Requisitos reales para que la tienda aparezca en el buscador de otros comercios (mismas reglas que el servidor). */
export function checklistItems(store: StoreView): Item[] {
  const open = openItem(store);
  const hasProducts = store.productCount > 0;
  const products: Item = hasProducts
    ? { key: "products", title: "Productos cargados", state: "done", detail: `${plural(store.productCount, "producto publicado", "productos publicados")}.` }
    : {
        key: "products",
        title: "Productos cargados",
        state: "todo",
        detail: "Todavía no hay ninguno. Cargalos con Google Sheets, subiendo un Excel o de a uno.",
        action: { kind: "tab", tab: "productos", label: "Cargar productos" },
      };
  const stock: Item = !hasProducts
    ? { key: "stock", title: "Productos con stock", state: "blocked", detail: "Lo sin stock no se les muestra a los compradores." }
    : store.inStockCount > 0
      ? {
          key: "stock",
          title: "Productos con stock",
          state: "done",
          detail: `${store.inStockCount} de ${store.productCount} tienen stock${
            store.inStockCount < store.productCount ? "; los que están en 0 no se muestran" : ""
          }.`,
        }
      : {
          key: "stock",
          title: "Productos con stock",
          state: "todo",
          detail: `Los ${store.productCount} productos tienen stock 0 y no se muestran. Si tu planilla trae el stock, revisá que esa columna esté asignada como «Stock».`,
          action: { kind: "href", href: "/vender/listas/perfil", label: "Qué columna es cada dato" },
        };
  const items = [open, importItem(store), products, stock, stockConfirmItem(store)].filter((i): i is Item => i != null);
  const readyToShow = items.every((i) => i.state === "done" || i.state === "warn");
  return [...items, audienceItem(store, readyToShow)];
}

export default function StorefrontChecklist({
  store,
  working,
  onGo,
  onReactivate,
  onConfirmStock,
}: {
  store: StoreView;
  working: "confirm" | "pause" | null;
  onGo: (tab: Tab) => void;
  onReactivate: () => void;
  onConfirmStock: () => void;
}) {
  const items = checklistItems(store);
  const current = items.find((i) => i.state === "todo")?.key;

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4 sm:p-5" aria-labelledby="checklist-title">
      <h2 id="checklist-title" className="text-sm font-semibold text-white">
        Para que otros comercios vean tu tienda
      </h2>
      <ol className="mt-3 flex flex-col gap-1.5">
        {items.map((item, i) => {
          const s = STATE_ICON[item.state];
          const isCurrent = item.key === current;
          const isDone = item.state === "done";
          return (
            <li
              key={item.key}
              className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${
                isCurrent ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-transparent"
              }`}
            >
              <span
                className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${
                  isDone
                    ? "bg-emerald-500/15 text-emerald-300"
                    : isCurrent
                      ? "bg-amber-400 text-surface-950"
                      : "border border-surface-700 text-surface-400"
                }`}
                aria-label={s.label}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : item.state === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 basis-60">
                <p className={`text-sm ${isDone ? "text-surface-300" : item.state === "blocked" ? "text-surface-500" : "font-medium text-white"}`}>{item.title}</p>
                {(!isDone || isCurrent) && <p className="text-[11px] leading-relaxed text-surface-400">{item.detail}</p>}
              </div>
              {item.action && !isDone && (
                <ActionButton action={item.action} working={working} onGo={onGo} onReactivate={onReactivate} onConfirmStock={onConfirmStock} primary={isCurrent} />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ActionButton({
  action,
  working,
  onGo,
  onReactivate,
  onConfirmStock,
  primary = false,
}: {
  action: Action;
  working: "confirm" | "pause" | null;
  onGo: (tab: Tab) => void;
  onReactivate: () => void;
  onConfirmStock: () => void;
  primary?: boolean;
}) {
  const cls = primary
    ? "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
    : "inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-3 py-1.5 text-xs font-semibold text-white hover:border-surface-400 disabled:opacity-50";
  if (action.kind === "href") {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }
  if (action.kind === "tab") {
    return (
      <button type="button" onClick={() => onGo(action.tab)} className={cls}>
        {action.label}
      </button>
    );
  }
  const busy = action.kind === "confirm" ? working === "confirm" : working === "pause";
  return (
    <button type="button" onClick={action.kind === "confirm" ? onConfirmStock : onReactivate} disabled={working !== null} className={cls}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {action.label}
    </button>
  );
}
