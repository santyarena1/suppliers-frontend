"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import { storefrontApi } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { compressImage } from "@/lib/imageCompress";
import { apiError } from "@/lib/storefront";

/**
 * Fotos de un producto (o el logo, con `max = 1`). Cada foto se achica en el
 * navegador y se sube a NODO, que devuelve el link. La primera es la principal.
 */
export default function ImagePicker({
  value,
  onChange,
  max = 8,
  label = "Fotos",
  hint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const room = max - value.length;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > list.length) setError(`Hasta ${max} ${max === 1 ? "foto" : "fotos"}.`);
    let next = [...value];
    for (let i = 0; i < list.length; i++) {
      setBusy(list.length > 1 ? `Subiendo ${i + 1} de ${list.length}…` : "Subiendo…");
      try {
        const small = await compressImage(list[i]);
        const res = await storefrontApi.uploadImage(small);
        next = [...next, res.url];
        onChange(next);
      } catch (err) {
        setError(apiError(err, "No se pudo subir la foto"));
        break;
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  function remove(ref: string) {
    onChange(value.filter((v) => v !== ref));
  }

  function makeMain(ref: string) {
    onChange([ref, ...value.filter((v) => v !== ref)]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-surface-400">{label}</span>
      <div className="flex flex-wrap gap-2">
        {value.map((ref, i) => (
          <div key={ref} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-surface-700 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxyImg(ref, { trim: false })} alt="" className="h-full w-full object-contain" />
            {i === 0 && max > 1 && (
              <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 text-[9px] font-semibold text-white">Principal</span>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/50 p-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => makeMain(ref)}
                  aria-label="Usar como principal"
                  title="Usar como principal"
                  className="grid h-6 w-6 place-items-center rounded bg-surface-900/80 text-white hover:bg-brand-600"
                >
                  <Star className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(ref)}
                aria-label="Quitar foto"
                title="Quitar"
                className="grid h-6 w-6 place-items-center rounded bg-surface-900/80 text-white hover:bg-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy !== null}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-surface-600 text-[10px] text-surface-400 hover:border-brand-500 hover:text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {busy ? "Subiendo" : "Agregar"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={max > 1}
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />
      {busy && <span className="text-[11px] text-surface-400">{busy}</span>}
      {error && <span className="text-[11px] text-red-300">{error}</span>}
      {hint && !error && <span className="text-[11px] text-surface-500">{hint}</span>}
    </div>
  );
}
