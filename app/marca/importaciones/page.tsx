"use client";

import { useEffect, useState, useRef } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { BRAND_PANEL_NAV } from "@/lib/brands/nav";
import { brandPanelApi, type ImportRecord, type ImportPreview } from "@/lib/brands";
import { IMPORT_STATUS_LABELS } from "@/lib/brands/constants";
import { Loader2, Download, Upload, Check, FileWarning } from "lucide-react";

export default function MarcaImportacionesPage() {
  const { toast, showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      setHistory(await brandPanelApi.importHistory());
    } catch {
      showToast("Error al cargar historial", false);
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    try {
      const res = await brandPanelApi.downloadTemplate();
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla-marcas.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Plantilla no disponible aún", false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setPreview(null);
    try {
      const p = await brandPanelApi.uploadImport(file);
      setPreview(p);
      showToast(`Previsualización: ${p.validRows} válidas, ${p.invalidRows} con error`);
    } catch {
      showToast("Error al procesar archivo", false);
    } finally {
      setUploading(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setConfirming(true);
    try {
      await brandPanelApi.confirmImport(preview.importId);
      showToast("Importación confirmada");
      setPreview(null);
      await loadHistory();
    } catch {
      showToast("Error al confirmar", false);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <RoleGuard allowed={["ROLE_BRAND"]} redirectTo="/marcas">
      <BrandModuleShell
        title="Importaciones"
        subtitle="Carga masiva Excel/CSV con validación"
        nav={BRAND_PANEL_NAV}
        headerAction={
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs font-medium bg-surface-800 hover:bg-surface-700 border border-surface-700 text-surface-200 rounded-lg px-3 py-2">
            <Download className="w-3.5 h-3.5" /> Descargar plantilla
          </button>
        }
      >
        <div className="mb-6">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Subir Excel o CSV
          </button>
        </div>

        {preview && (
          <div className="mb-8 bg-surface-800 border border-surface-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Previsualización</h3>
            <p className="text-xs text-surface-400 mb-4">
              {preview.validRows} filas válidas · {preview.invalidRows} con error
            </p>
            {preview.errors.length > 0 && (
              <div className="mb-4 max-h-40 overflow-y-auto space-y-1">
                {preview.errors.slice(0, 20).map((e, i) => (
                  <p key={i} className="text-xs text-red-400 flex items-center gap-1">
                    <FileWarning className="w-3 h-3" /> Fila {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}
            <table className="w-full text-xs mb-4">
              <thead><tr className="text-surface-500">
                <th className="text-left py-1">Fila</th><th className="text-left py-1">Acción</th>
                <th className="text-left py-1">SKU</th><th className="text-left py-1">Producto</th>
              </tr></thead>
              <tbody>
                {preview.preview.slice(0, 10).map((r) => (
                  <tr key={r.row} className="border-t border-surface-700">
                    <td className="py-1.5 text-surface-400">{r.row}</td>
                    <td className="py-1.5 text-brand-400">{r.action}</td>
                    <td className="py-1.5 font-mono">{r.sku}</td>
                    <td className="py-1.5">{r.commercialName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={confirmImport} disabled={confirming || preview.validRows === 0}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
              <Check className="w-4 h-4" /> {confirming ? "Confirmando..." : "Confirmar importación"}
            </button>
          </div>
        )}

        <h3 className="text-sm font-semibold text-white mb-3">Historial</h3>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : history.length === 0 ? (
          <p className="text-sm text-surface-500">Sin importaciones previas.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="bg-surface-800 border border-surface-700 rounded-lg px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white font-medium">{h.originalFileName}</span>
                  <span className="text-xs text-surface-500">{new Date(h.importedAt).toLocaleString("es-AR")}</span>
                </div>
                <p className="text-xs text-surface-400 mt-1">
                  {h.productsCreated} creados · {h.productsUpdated} actualizados · {h.errorCount} errores · {IMPORT_STATUS_LABELS[h.status]}
                </p>
              </div>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
