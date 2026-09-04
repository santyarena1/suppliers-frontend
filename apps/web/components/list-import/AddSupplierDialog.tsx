"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Loader2, Plug, Plus, Search, Ticket, X } from "lucide-react";
import RedeemAccessCode from "@/components/RedeemAccessCode";
import CreateListProviderDialog from "@/components/list-import/CreateListProviderDialog";
import { invalidateMyProviders, suppliersApi, type SupplierSearchRow } from "@/lib/api";

type Step = "choose" | "code" | "search";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Proveedor (distribuidor) o marca: cambia textos y el tipo al crear. */
  kind: "provider" | "brand";
  onConnected?: () => void;
};

/**
 * "Agregar proveedor / marca" para un comercio: con un código de acceso, o
 * cargando su lista de precios. Antes de crear uno nuevo busca en el directorio
 * para no duplicar a alguien que ya existe.
 */
export default function AddSupplierDialog({ open, onClose, kind, onConnected }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SupplierSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const type = kind === "brand" ? "BRAND" : "DISTRIBUTOR";
  const noun = kind === "brand" ? "marca" : "proveedor";

  useEffect(() => {
    if (!open) {
      setStep("choose");
      setQuery("");
      setRows([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (step !== "search") return;
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      suppliersApi
        .search(query.trim(), type)
        .then((r) => alive && setRows(r.data))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setSearching(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [step, query, type]);

  if (!open) return null;

  async function connect(row: SupplierSearchRow) {
    setConnecting(row.id);
    setError(null);
    try {
      const res = await suppliersApi.connectByList(row.id);
      invalidateMyProviders();
      onConnected?.();
      onClose();
      router.push(`/proveedores/${res.data.provider}?tab=lists`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo conectar");
    } finally {
      setConnecting(null);
    }
  }

  const exactExists = rows.some((r) => r.name.trim().toLowerCase() === query.trim().toLowerCase());

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-surface-950 border border-surface-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
            <div>
              <h2 className="text-sm font-semibold text-white">Agregar {noun}</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                {step === "choose" && "¿Cómo te conectás?"}
                {step === "code" && "Canjeá el código que te dieron por fuera de Nodo."}
                {step === "search" && `Buscá ${kind === "brand" ? "la marca" : "el distribuidor"} antes de crearlo: si ya existe, te conectás a su ficha.`}
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-surface-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          <div className="overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {step === "choose" && (
              <>
                <button
                  type="button"
                  onClick={() => setStep("code")}
                  className="text-left border border-surface-800 hover:border-brand-500 rounded-xl p-4 flex items-start gap-3 transition-colors"
                >
                  <Ticket className="w-5 h-5 text-brand-700 dark:text-brand-400 mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-white">Tengo un código de acceso</span>
                    <span className="block text-xs text-surface-500 mt-0.5">
                      Te lo dio {kind === "brand" ? "la marca" : "el distribuidor"}. Quedás vinculado con vendedor, chat y su catálogo.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep("search")}
                  className="text-left border border-surface-800 hover:border-brand-500 rounded-xl p-4 flex items-start gap-3 transition-colors"
                >
                  <FileSpreadsheet className="w-5 h-5 text-brand-700 dark:text-brand-400 mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-white">Cargar su lista de precios</span>
                    <span className="block text-xs text-surface-500 mt-0.5">
                      Te mandan la lista por WhatsApp o mail. La subís vos y ves sus productos con tus precios. Sin vendedor ni chat hasta que te reconozcan.
                    </span>
                  </span>
                </button>
              </>
            )}

            {step === "code" && (
              <RedeemAccessCode
                purpose={kind === "brand" ? "brand" : "any"}
                onRedeemed={() => {
                  invalidateMyProviders();
                  onConnected?.();
                  onClose();
                }}
              />
            )}

            {step === "search" && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Nombre ${kind === "brand" ? "de la marca" : "del distribuidor"}…`}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
                  />
                </div>
                {error && <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                <div className="border border-surface-800 rounded-xl divide-y divide-surface-800 max-h-72 overflow-y-auto">
                  {searching && rows.length === 0 ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-brand-500" /></div>
                  ) : rows.length === 0 ? (
                    <p className="text-xs text-surface-500 text-center py-6">{query.trim() ? "No hay ninguno con ese nombre." : "Escribí para buscar."}</p>
                  ) : (
                    rows.map((r) => {
                      const linked = r.linkStatus === "ACTIVE" || r.linkStatus === "LIST_CONNECTED" || r.linkStatus === "SUSPENDED";
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-surface-100 truncate">{r.name}</p>
                            <p className="text-[11px] text-surface-500">
                              {r.type === "BRAND" ? "Marca" : "Distribuidor"}
                              {r.hasApi ? " · con integración" : r.providerKey ? " · por lista" : ""}
                              {r.linkStatus === "LIST_CONNECTED" ? " · ya conectado por lista" : r.linkStatus === "ACTIVE" ? " · ya vinculado" : ""}
                            </p>
                          </div>
                          {linked ? (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                if (r.providerKey) router.push(`/proveedores/${r.providerKey}?tab=lists`);
                              }}
                              className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ir
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => connect(r)}
                              disabled={connecting === r.id}
                              className="flex items-center gap-1 text-[11px] font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-md px-2.5 py-1.5"
                            >
                              {connecting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />} Conectar por lista
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                {query.trim().length >= 2 && !exactExists && (
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-2 text-sm font-medium border border-dashed border-surface-700 hover:border-brand-500 text-surface-200 rounded-lg px-3.5 py-2.5"
                  >
                    <Plus className="w-4 h-4" /> Crear “{query.trim()}” como {noun} nuevo
                  </button>
                )}
              </>
            )}
          </div>

          {step !== "choose" && (
            <div className="px-5 py-3 border-t border-surface-800">
              <button type="button" onClick={() => setStep("choose")} className="text-xs text-surface-400 hover:text-white">← Volver</button>
            </div>
          )}
        </div>
      </div>

      <CreateListProviderDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
        }}
        showPurchaseConfig
        initialName={query.trim()}
        initialType={type}
        onCreated={() => {
          onConnected?.();
          onClose();
        }}
      />
    </>
  );
}
