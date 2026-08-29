"use client";

import { useCallback, useEffect, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import { assetsApi, brandApi, type BrandResource } from "@/lib/api";
import { assetUrl } from "@/lib/assets";
import { Download, Loader2, Plus, Trash2, Upload } from "lucide-react";

const MATERIAL_TYPES: { value: string; label: string }[] = [
  { value: "BANNER", label: "Banner" },
  { value: "IMAGE", label: "Imagen" },
  { value: "DATASHEET", label: "Ficha técnica" },
  { value: "CATALOG", label: "Catálogo" },
  { value: "VIDEO", label: "Video" },
  { value: "PROMOTION", label: "Promo" },
  { value: "PRESENTATION", label: "Presentación" },
  { value: "MANUAL", label: "Manual" },
  { value: "WARRANTY", label: "Garantía" },
  { value: "COMMERCIAL", label: "Comercial" },
];

const TRAINING_TYPES: { value: string; label: string }[] = [
  { value: "VIDEO", label: "Video" },
  { value: "LINK", label: "Link" },
  { value: "PDF", label: "PDF" },
  { value: "COURSE", label: "Curso" },
  { value: "SALES_PITCH", label: "Argumentario de venta" },
  { value: "CERTIFICATION", label: "Certificación" },
];

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

export default function BrandResourcesEditor({
  kind,
}: {
  kind: "MATERIAL" | "TRAINING";
}) {
  const training = kind === "TRAINING";
  const types = training ? TRAINING_TYPES : MATERIAL_TYPES;
  const [items, setItems] = useState<BrandResource[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState(types[0].value);
  const [description, setDescription] = useState("");
  const [contentUrl, setContentUrl] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const res = await brandApi.resources(kind);
    setItems(res.data.resources);
    setCanWrite(res.data.canWrite);
  }, [kind]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setAviso({ ok: false, text: errMsg(err, "No se pudieron cargar") }))
      .finally(() => setLoading(false));
  }, [load]);

  async function onFile(file: File) {
    setUploading(true);
    try {
      const data = await assetsApi.uploadFile(file);
      setFileUrl(data.url);
      setFileName(data.filename);
      setAviso({ ok: true, text: "Archivo listo para publicar" });
    } catch (err) {
      setAviso({ ok: false, text: err instanceof Error ? err.message : "No se pudo subir" });
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    if (!canWrite || !title.trim()) return;
    setSaving(true);
    try {
      await brandApi.createResource({
        kind,
        type,
        title: title.trim(),
        description: description.trim() || null,
        fileUrl,
        contentUrl: contentUrl.trim() || null,
      });
      setTitle("");
      setDescription("");
      setContentUrl("");
      setFileUrl(null);
      setFileName(null);
      setAviso({ ok: true, text: "Publicado en el espacio de la marca" });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo publicar") });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!canWrite) return;
    try {
      await brandApi.removeResource(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo borrar") });
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">{training ? "Capacitaciones" : "Materiales"}</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            {training
              ? "Cursos, videos y argumentarios para el local o el distro vinculado. Aparecen en el espacio de la marca."
              : "Banners, fichas y catálogos para quien está vinculado. No es un catálogo de productos."}
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              {canWrite && (
                <section className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-white">Publicar</h2>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input
                      className={inputClass}
                      placeholder="Título"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                    <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
                      {types.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className={`${inputClass} min-h-[64px]`}
                    placeholder="Descripción (opcional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    placeholder="O un link (YouTube, Drive, sitio)"
                    value={contentUrl}
                    onChange={(e) => setContentUrl(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold border border-surface-700 rounded-lg px-3 py-2 text-surface-200 cursor-pointer inline-flex items-center gap-1.5">
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Subir PDF, Excel o imagen
                      <input
                        type="file"
                        accept="image/*,.pdf,.xls,.xlsx,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onFile(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {fileName && <span className="text-[11px] text-emerald-400 truncate">{fileName}</span>}
                    <button
                      type="button"
                      disabled={saving || !title.trim() || (!fileUrl && !contentUrl.trim())}
                      onClick={() => void create()}
                      className="ml-auto text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 inline-flex items-center gap-1"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Publicar
                    </button>
                  </div>
                </section>
              )}

              <ul className="flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="text-xs text-surface-500 text-center py-10">Todavía no hay nada publicado.</p>
                ) : (
                  items.map((item) => {
                    const href = item.fileUrl ? assetUrl(item.fileUrl) : item.contentUrl;
                    const typeLabel = types.find((t) => t.value === item.type)?.label ?? item.type;
                    return (
                      <li
                        key={item.id}
                        className="border border-surface-800 rounded-xl px-4 py-3 bg-surface-900 flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white truncate">{item.title}</p>
                          <p className="text-[11px] text-surface-500">
                            {typeLabel}
                            {item.description ? ` · ${item.description}` : ""}
                          </p>
                        </div>
                        {href && (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-surface-400 hover:text-white"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {canWrite && (
                          <button type="button" onClick={() => void remove(item.id)} className="text-surface-500 hover:text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
