"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Check } from "lucide-react";
import { blobToDataUrl, removeWhiteBackground } from "@/lib/imageProcess";

type Props = {
  file: File;
  uploading?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

/**
 * Modal de preview antes de subir: opción de quitar fondo blanco.
 */
export default function ImageUploadPreviewModal({
  file,
  uploading = false,
  onCancel,
  onConfirm,
}: Props) {
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [processedFile, setProcessedFile] = useState<File | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    setOriginalPreview(null);
    setProcessedPreview(null);
    setProcessedFile(null);
    setRemoveBg(false);
    setError(null);
    blobToDataUrl(file)
      .then((url) => {
        if (!alive) return;
        setOriginalPreview(url);
        setReady(true);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "No se pudo leer la imagen");
        setReady(false);
      });
    return () => {
      alive = false;
    };
  }, [file]);

  async function toggleRemoveBg(enabled: boolean) {
    if (!enabled) {
      setRemoveBg(false);
      return;
    }
    if (processedFile && processedPreview) {
      setRemoveBg(true);
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const next = await removeWhiteBackground(file);
      const preview = await blobToDataUrl(next);
      setProcessedFile(next);
      setProcessedPreview(preview);
      setRemoveBg(true);
    } catch (e) {
      setRemoveBg(false);
      setError(e instanceof Error ? e.message : "No se pudo quitar el fondo");
    } finally {
      setProcessing(false);
    }
  }

  const preview =
    removeBg && processedPreview ? processedPreview : originalPreview;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Vista previa</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            className="text-surface-500 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="w-full aspect-square rounded-xl border border-surface-700 overflow-hidden mb-4 flex items-center justify-center"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
            backgroundColor: "#18181b",
          }}
        >
          {!ready || !preview ? (
            <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa" className="max-w-full max-h-full object-contain" />
          )}
        </div>

        <label className="flex items-start gap-3 mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={removeBg}
            disabled={processing || uploading || !ready}
            onChange={(e) => void toggleRemoveBg(e.target.checked)}
            className="mt-0.5 rounded border-surface-600"
          />
          <span>
            <span className="text-sm text-surface-200 block">Quitar fondo blanco</span>
            <span className="text-[11px] text-surface-500 leading-snug block">
              Ideal para logos: los píxeles blancos pasan a transparentes antes de subir.
            </span>
          </span>
        </label>

        {processing && (
          <p className="text-xs text-surface-400 flex items-center gap-2 mb-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando…
          </p>
        )}
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            className="px-3 py-2 rounded-lg border border-surface-700 text-xs text-surface-300 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() =>
              void onConfirm(removeBg && processedFile ? processedFile : file)
            }
            disabled={uploading || processing || !ready}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Subir imagen
          </button>
        </div>
      </div>
    </div>
  );
}
