"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { assetsApi } from "@/lib/api";
import { assetUrl } from "@/lib/assets";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** Guardar en servidor (blur del input o tras subir archivo). */
  onCommit?: (url: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** `inline` para filas compactas (proveedores/marcas); `full` para formularios. */
  variant?: "inline" | "full";
}

export default function ImageUploadField({
  value,
  onChange,
  onCommit,
  label,
  placeholder = "URL de la imagen (opcional)",
  required,
  className,
  variant = "full",
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url } = await assetsApi.upload(file);
      onChange(url);
      onCommit?.(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  }

  const preview = value ? assetUrl(value) : "";
  const inputCls =
    "bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";
  const fullInputCls =
    "flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

  if (variant === "inline") {
    return (
      <div className={`flex-1 flex items-center gap-1.5 min-w-0 ${className ?? ""}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.(value)}
          placeholder={placeholder}
          required={required}
          className={`flex-1 min-w-0 ${inputCls}`}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          title="Subir desde la PC"
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md border border-surface-700 bg-surface-800 text-surface-400 hover:text-white hover:border-brand-500/50 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        </button>
        {error && <span className="text-[10px] text-red-400 truncate max-w-[80px]" title={error}>{error}</span>}
      </div>
    );
  }

  return (
    <div className={className}>
      {label && <label className="text-xs text-surface-400 block mb-1">{label}</label>}
      <div className="flex gap-3 items-start">
        {preview ? (
          <div className="w-20 h-20 rounded-lg bg-surface-800 border border-surface-700 overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-lg bg-surface-800 border border-surface-700 flex-shrink-0 flex items-center justify-center text-surface-600">
            <Upload className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              required={required}
              className={fullInputCls}
            />
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-700 bg-surface-800 text-xs text-surface-300 hover:text-white hover:border-brand-500/50 disabled:opacity-50 flex-shrink-0"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Subir desde PC
            </button>
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <p className="text-[10px] text-surface-600">JPG, PNG, WebP, GIF o SVG · máx. 5 MB. También podés pegar una URL externa.</p>
        </div>
      </div>
    </div>
  );
}
