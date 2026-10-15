"use client";

import { useRef, useState } from "react";
import { Globe, ImagePlus, Loader2, Search, Sparkles, Star, X } from "lucide-react";
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
  searchQuery,
  autoImage,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
  /** Con texto, ofrece «Buscar en internet» (Serper) con este texto de arranque. */
  searchQuery?: string;
  /** Foto que NODO encontró sola para el producto: se marca para que se entienda de dónde salió. */
  autoImage?: string | null;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
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

  /** Una foto de internet: se baja por el proxy de NODO, se achica y se sube como si fuera propia. */
  async function addFromWeb(url: string) {
    if (room <= 0) return setError(`Hasta ${max} ${max === 1 ? "foto" : "fotos"}.`);
    setError(null);
    setBusy("Guardando la foto…");
    try {
      const res = await fetch(proxyImg(url, { trim: false }));
      if (!res.ok) throw new Error("Esa foto no se pudo bajar. Probá con otra.");
      const blob = await res.blob();
      const file = new File([blob], "foto-web", { type: blob.type || "image/jpeg" });
      const small = await compressImage(file);
      const up = await storefrontApi.uploadImage(small);
      onChange([...value, up.url]);
      setSearchOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : apiError(err, "No se pudo guardar la foto"));
    } finally {
      setBusy(null);
    }
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
            {autoImage && ref === autoImage && (
              <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-sky-600 px-1 text-[9px] font-semibold text-white" title="NODO la encontró sola. Podés dejarla, cambiarla o sacarla.">
                <Sparkles className="h-2.5 w-2.5" /> NODO
              </span>
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
        {room > 0 && searchQuery !== undefined && (
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            disabled={busy !== null}
            aria-expanded={searchOpen}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-sky-600/60 text-center text-[10px] leading-tight text-sky-300 hover:border-sky-400 hover:text-white disabled:opacity-60"
          >
            <Globe className="h-4 w-4" />
            Buscar en internet
          </button>
        )}
      </div>
      {searchOpen && searchQuery !== undefined && (
        <WebImageSearch initial={searchQuery} busy={busy !== null} onPick={(url) => void addFromWeb(url)} onClose={() => setSearchOpen(false)} />
      )}
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

/** Resultados de Serper (como «Primera foto»): se elige una y queda en el producto. */
function WebImageSearch({
  initial,
  busy,
  onPick,
  onClose,
}: {
  initial: string;
  busy: boolean;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<{ imageUrl: string; thumbnailUrl: string | null; title: string | null }[] | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 3) return setError("Escribí al menos 3 letras (mejor: marca y modelo).");
    setLoading(true);
    setError(null);
    try {
      const { data } = await storefrontApi.searchImages(q.trim());
      setImages(data.images);
      setLeft(data.left);
      setBroken(new Set());
    } catch (err) {
      setError(apiError(err, "No se pudo buscar"));
    } finally {
      setLoading(false);
    }
  }

  const shown = (images ?? []).filter((img) => !broken.has(img.imageUrl));
  return (
    <div className="rounded-xl border border-sky-600/30 bg-sky-500/[0.04] p-3">
      <form onSubmit={search} className="flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            placeholder="Marca y modelo del producto"
            aria-label="Qué foto buscar"
            className="w-full rounded-lg border border-surface-700 bg-surface-950 py-2 pl-8 pr-3 text-xs text-white placeholder:text-surface-600 focus:border-sky-500 focus:outline-none"
          />
        </label>
        <button type="submit" disabled={loading || busy} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Buscar"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-surface-400 hover:text-white" aria-label="Cerrar búsqueda de fotos">
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
      {error && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
      {images && shown.length === 0 && !loading && <p className="mt-2 text-[11px] text-surface-400">No encontramos fotos. Probá con la marca y el modelo exacto.</p>}
      {shown.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {shown.map((img) => (
            <button
              key={img.imageUrl}
              type="button"
              disabled={busy}
              onClick={() => onPick(img.imageUrl)}
              title={img.title ?? "Usar esta foto"}
              className="relative aspect-square overflow-hidden rounded-lg border border-surface-700 bg-white hover:border-sky-400 disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyImg(img.thumbnailUrl ?? img.imageUrl, { trim: false })}
                alt={img.title ?? ""}
                loading="lazy"
                onError={() => setBroken((b) => new Set(b).add(img.imageUrl))}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-surface-500">
        {images ? "Tocá una para usarla. " : "Buscamos en Google Imágenes, como hace NODO con la «Primera foto». "}
        Usá fotos del producto real; si tenés las tuyas, mejor.
        {left != null && ` Te quedan ${left} búsquedas hoy.`}
      </p>
    </div>
  );
}
