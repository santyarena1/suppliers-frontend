"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploadField from "@/components/ImageUploadField";
import { getTenant } from "@/lib/auth";
import { assetsApi, newsApi, type NewsDetail, type NewsKind, type UpsertNewsPayload } from "@/lib/api";
import { NEWS_HTML_STARTER, NEWS_KIND_LABELS, NEWS_KIND_ORDER } from "@/lib/news";
import NewsHtmlBody from "./NewsHtmlBody";
import NewsPhoto from "./NewsPhoto";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

type Draft = {
  title: string;
  excerpt: string;
  bodyHtml: string;
  coverUrl: string;
  kind: NewsKind;
  isPublic: boolean;
  notifyOnPublish: boolean;
  publishedAt: string;
  expiresAt: string;
  scopeBrandName: string;
  images: { url: string; caption: string }[];
  attachments: {
    kind: "PRICE_LIST" | "FILE" | "LINK";
    title: string;
    fileUrl: string;
    contentUrl: string;
    visibility: "IN_APP" | "PUBLIC";
  }[];
  relatedSkus: { provider: string; externalId: string; name: string }[];
};

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromExisting(article?: NewsDetail | null): Draft {
  return {
    title: article?.title ?? "",
    excerpt: article?.excerpt ?? "",
    bodyHtml: article?.bodyRaw || article?.bodyHtml || NEWS_HTML_STARTER,
    coverUrl: article?.coverUrl ?? "",
    kind: article?.kind ?? "OTHER",
    isPublic: article?.isPublic ?? false,
    notifyOnPublish: article?.notifyOnPublish ?? false,
    publishedAt: toLocalInput(article?.publishedAt),
    expiresAt: toLocalInput(article?.expiresAt),
    scopeBrandName: article?.scopeBrandName ?? "",
    images: (article?.images ?? []).map((img) => ({ url: img.url, caption: img.caption ?? "" })),
    attachments: (article?.attachments ?? []).map((a) => ({
      kind: a.kind === "LINK" ? "LINK" : a.kind === "PRICE_LIST" ? "PRICE_LIST" : "FILE",
      title: a.title,
      fileUrl: a.fileUrl ?? "",
      contentUrl: a.contentUrl ?? "",
      visibility: a.kind === "PRICE_LIST" ? "IN_APP" : a.visibility,
    })),
    relatedSkus: article?.relatedSkus ?? [],
  };
}

function payloadOf(draft: Draft, status: UpsertNewsPayload["status"]): UpsertNewsPayload {
  return {
    title: draft.title.trim(),
    excerpt: draft.excerpt.trim(),
    bodyHtml: draft.bodyHtml,
    coverUrl: draft.coverUrl || null,
    kind: draft.kind,
    status,
    isPublic: draft.isPublic,
    notifyOnPublish: draft.notifyOnPublish,
    publishedAt: draft.publishedAt ? new Date(draft.publishedAt).toISOString() : null,
    expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
    scopeBrandName: draft.scopeBrandName.trim() || null,
    images: draft.images.filter((img) => img.url).map((img) => ({ url: img.url, caption: img.caption || null })),
    attachments: draft.attachments
      .filter((a) => a.title.trim() && (a.fileUrl || a.contentUrl))
      .map((a) => ({
        kind: a.kind,
        title: a.title.trim(),
        fileUrl: a.fileUrl || null,
        contentUrl: a.contentUrl || null,
        visibility: a.kind === "PRICE_LIST" ? "IN_APP" : a.visibility,
      })),
    relatedSkus: draft.relatedSkus.filter((sku) => sku.name.trim() && sku.provider.trim() && sku.externalId.trim()),
  };
}

const field =
  "w-full bg-transparent border-0 border-b border-surface-700 rounded-none px-0 py-2 text-white placeholder-surface-600 focus:outline-none focus:border-white/50";

export default function NewsEditor({ article }: { article?: NewsDetail | null }) {
  const router = useRouter();
  const tenant = getTenant();
  const isPm = tenant?.role === "PRODUCT_MANAGER";
  const [draft, setDraft] = useState<Draft>(() => fromExisting(article));
  const [tab, setTab] = useState<"write" | "html">("html");
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (article) setDraft(fromExisting(article));
  }, [article]);

  const previewHtml = useMemo(() => draft.bodyHtml, [draft.bodyHtml]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save(status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    if (status === "PUBLISHED" && draft.attachments.some((a) => a.kind === "PRICE_LIST")) {
      const ok = window.confirm(
        "Hay una lista de precios. Queda solo adentro de NODO, para cuentas vinculadas. ¿Publicamos?"
      );
      if (!ok) return;
    }
    setSaving(true);
    setAviso(null);
    try {
      const body = payloadOf(draft, status);
      const res = article ? await newsApi.update(article.id, body) : await newsApi.create(body);
      router.push(`/noticias/${res.data.id}`);
    } catch (err) {
      setAviso(errMsg(err, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!article) return;
    if (!window.confirm("¿Borrar esta nota? No se puede deshacer.")) return;
    setSaving(true);
    try {
      await newsApi.remove(article.id);
      router.push("/noticias");
    } catch (err) {
      setAviso(errMsg(err, "No se pudo borrar"));
    } finally {
      setSaving(false);
    }
  }

  async function addGallery(file: File) {
    const { url } = await assetsApi.upload(file);
    setDraft((prev) => ({ ...prev, images: [...prev.images, { url, caption: "" }] }));
  }

  async function addFile(file: File, kind: "PRICE_LIST" | "FILE") {
    const uploaded = await assetsApi.uploadFile(file);
    setDraft((prev) => ({
      ...prev,
      attachments: [
        ...prev.attachments,
        {
          kind,
          title: file.name.replace(/\.[^.]+$/, ""),
          fileUrl: uploaded.url,
          contentUrl: "",
          visibility: kind === "PRICE_LIST" ? "IN_APP" : "IN_APP",
        },
      ],
    }));
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="flex flex-col gap-6 min-w-0">
          <input
            className={`news-serif text-3xl sm:text-4xl font-semibold tracking-tight ${field}`}
            placeholder="Titular"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
          <textarea
            className={`text-[17px] leading-relaxed resize-none ${field}`}
            placeholder="Bajada — una o dos frases"
            rows={2}
            value={draft.excerpt}
            onChange={(e) => set("excerpt", e.target.value)}
          />

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-surface-500 mb-2">Portada</p>
            {draft.coverUrl && (
              <div className="aspect-[16/9] mb-3 overflow-hidden bg-black">
                <NewsPhoto src={draft.coverUrl} alt="" />
              </div>
            )}
            <ImageUploadField
              value={draft.coverUrl}
              onChange={(url) => set("coverUrl", url)}
              label=""
              placeholder="Subí una foto grande. Es la cara de la nota."
            />
          </div>

          <div className="flex gap-4 text-[12px] uppercase tracking-[0.14em] text-surface-500">
            <button type="button" className={tab === "html" ? "text-white" : ""} onClick={() => setTab("html")}>
              HTML
            </button>
            <button type="button" className={tab === "write" ? "text-white" : ""} onClick={() => setTab("write")}>
              Texto
            </button>
          </div>

          {tab === "html" ? (
            <div>
              <p className="text-[12px] text-surface-500 mb-2 leading-relaxed">
                El cuerpo puede ser HTML propio: CSS, tipografía, fotos. Así cada nota tiene identidad, no una plantilla.
              </p>
              <textarea
                className="w-full min-h-[360px] bg-[#0e1014] border border-surface-800 px-3 py-3 text-[12.5px] leading-relaxed font-mono text-surface-200 focus:outline-none focus:border-surface-500"
                spellCheck={false}
                value={draft.bodyHtml}
                onChange={(e) => set("bodyHtml", e.target.value)}
              />
              <button
                type="button"
                className="mt-2 text-[11px] text-surface-500 hover:text-white"
                onClick={() => set("bodyHtml", NEWS_HTML_STARTER)}
              >
                Restaurar plantilla
              </button>
            </div>
          ) : (
            <textarea
              className="news-serif w-full min-h-[280px] bg-transparent border border-surface-800 px-4 py-3 text-[18px] leading-relaxed text-white focus:outline-none focus:border-surface-500"
              placeholder="Cuerpo de la nota"
              value={draft.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
              onChange={(e) => {
                const paras = e.target.value
                  .split(/\n{2,}/)
                  .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
                  .join("\n");
                set("bodyHtml", paras);
              }}
            />
          )}

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-surface-500 mb-2">Galería</p>
            <div className="grid grid-cols-2 gap-2">
              {draft.images.map((img, i) => (
                <div key={`${img.url}-${i}`} className="relative">
                  <div className="aspect-[4/3] overflow-hidden">
                    <NewsPhoto src={img.url} alt="" />
                  </div>
                  <input
                    className="mt-1 w-full bg-transparent border-b border-surface-800 text-[12px] text-surface-300 focus:outline-none"
                    placeholder="Pie de foto"
                    value={img.caption}
                    onChange={(e) => {
                      const images = [...draft.images];
                      images[i] = { ...images[i], caption: e.target.value };
                      set("images", images);
                    }}
                  />
                  <button
                    type="button"
                    className="text-[11px] text-surface-500 mt-1"
                    onClick={() => set("images", draft.images.filter((_, j) => j !== i))}
                  >
                    Sacar
                  </button>
                </div>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void addGallery(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 text-[13px] text-surface-300 hover:text-white"
            >
              + Foto
            </button>
          </div>

          {article?.stats && (
            <p className="text-[12px] text-surface-500">
              {article.stats.views} vistas · {article.stats.attachmentClicks} descargas de adjuntos
            </p>
          )}

          {isPm && (
            <label className="text-[12px] text-surface-500">
              Marca de esta nota
              <input
                className={`mt-1 ${field}`}
                placeholder="La marca que tenés asignada"
                value={draft.scopeBrandName}
                onChange={(e) => set("scopeBrandName", e.target.value)}
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="text-[12px] text-surface-500">
              Tipo
              <select
                className="mt-1 w-full bg-surface-900 border border-surface-800 px-2 py-2 text-sm text-white"
                value={draft.kind}
                onChange={(e) => set("kind", e.target.value as NewsKind)}
              >
                {NEWS_KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {NEWS_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-surface-500">
              Publicar el
              <input
                type="datetime-local"
                className="mt-1 w-full bg-surface-900 border border-surface-800 px-2 py-2 text-sm text-white"
                value={draft.publishedAt}
                onChange={(e) => set("publishedAt", e.target.value)}
              />
            </label>
            <label className="text-[12px] text-surface-500">
              Vence
              <input
                type="datetime-local"
                className="mt-1 w-full bg-surface-900 border border-surface-800 px-2 py-2 text-sm text-white"
                value={draft.expiresAt}
                onChange={(e) => set("expiresAt", e.target.value)}
              />
            </label>
          </div>

          <label className="flex items-start gap-2 text-sm text-surface-300">
            <input type="checkbox" checked={draft.isPublic} onChange={(e) => set("isPublic", e.target.checked)} />
            Enlace público (`/n/…`). La lista de precios no viaja con el link.
          </label>
          <label className="flex items-start gap-2 text-sm text-surface-300">
            <input
              type="checkbox"
              checked={draft.notifyOnPublish}
              onChange={(e) => set("notifyOnPublish", e.target.checked)}
            />
            Avisar a las cuentas vinculadas al publicar
          </label>

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-surface-500 mb-2">Adjuntos</p>
            {draft.attachments.map((a, i) => (
              <div key={i} className="flex gap-2 items-center text-[13px] text-surface-300 py-1">
                <span className="text-surface-500 w-24 flex-shrink-0">
                  {a.kind === "PRICE_LIST" ? "Lista" : a.kind === "LINK" ? "Link" : "Archivo"}
                </span>
                <span className="truncate flex-1">{a.title}</span>
                {a.kind === "FILE" && (
                  <button
                    type="button"
                    className="text-[11px] text-surface-500"
                    onClick={() => {
                      const attachments = [...draft.attachments];
                      attachments[i] = {
                        ...attachments[i],
                        visibility: a.visibility === "PUBLIC" ? "IN_APP" : "PUBLIC",
                      };
                      set("attachments", attachments);
                    }}
                  >
                    {a.visibility === "PUBLIC" ? "Público" : "Solo red"}
                  </button>
                )}
                <button
                  type="button"
                  className="text-surface-500"
                  onClick={() => set("attachments", draft.attachments.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-3 mt-2">
              <label className="text-[13px] text-surface-300 cursor-pointer">
                + Lista de precios
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void addFile(f, "PRICE_LIST");
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="text-[13px] text-surface-300 cursor-pointer">
                + Archivo
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void addFile(f, "FILE");
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <input
                className={`${field} text-sm`}
                placeholder="Título del link"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
              />
              <input
                className={`${field} text-sm`}
                placeholder="https://…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <button
                type="button"
                className="text-[13px] text-surface-300 whitespace-nowrap"
                onClick={() => {
                  if (!linkTitle.trim() || !linkUrl.trim()) return;
                  set("attachments", [
                    ...draft.attachments,
                    {
                      kind: "LINK",
                      title: linkTitle.trim(),
                      fileUrl: "",
                      contentUrl: linkUrl.trim(),
                      visibility: "PUBLIC",
                    },
                  ]);
                  setLinkTitle("");
                  setLinkUrl("");
                }}
              >
                + Link
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-surface-500 mb-2">SKUs del catálogo</p>
            <p className="text-[12px] text-surface-500 mb-2">
              Solo los ve un comercio vinculado. Si no hay vínculo, el chip no aparece.
            </p>
            {draft.relatedSkus.map((sku, i) => (
              <div key={`${sku.provider}-${sku.externalId}-${i}`} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-2">
                <input
                  className={`${field} text-sm`}
                  placeholder="Nombre"
                  value={sku.name}
                  onChange={(e) => {
                    const relatedSkus = [...draft.relatedSkus];
                    relatedSkus[i] = { ...relatedSkus[i], name: e.target.value };
                    set("relatedSkus", relatedSkus);
                  }}
                />
                <input
                  className={`${field} text-sm`}
                  placeholder="Proveedor"
                  value={sku.provider}
                  onChange={(e) => {
                    const relatedSkus = [...draft.relatedSkus];
                    relatedSkus[i] = { ...relatedSkus[i], provider: e.target.value };
                    set("relatedSkus", relatedSkus);
                  }}
                />
                <input
                  className={`${field} text-sm`}
                  placeholder="Código"
                  value={sku.externalId}
                  onChange={(e) => {
                    const relatedSkus = [...draft.relatedSkus];
                    relatedSkus[i] = { ...relatedSkus[i], externalId: e.target.value };
                    set("relatedSkus", relatedSkus);
                  }}
                />
                <button
                  type="button"
                  className="text-surface-500"
                  onClick={() => set("relatedSkus", draft.relatedSkus.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-[13px] text-surface-300 hover:text-white"
              onClick={() => set("relatedSkus", [...draft.relatedSkus, { name: "", provider: "", externalId: "" }])}
            >
              + SKU
            </button>
          </div>

          {aviso && <p className="text-sm text-red-400">{aviso}</p>}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save("DRAFT")}
              className="px-4 py-2 text-sm border border-surface-700 text-surface-200 hover:text-white disabled:opacity-50"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save("PUBLISHED")}
              className="px-4 py-2 text-sm bg-white text-black hover:bg-surface-100 disabled:opacity-50"
            >
              Publicar
            </button>
            {article && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save("ARCHIVED")}
                  className="px-4 py-2 text-sm text-surface-400 hover:text-white disabled:opacity-50"
                >
                  Archivar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void remove()}
                  className="px-4 py-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Borrar
                </button>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-surface-500 mb-3">Así se ve</p>
          <div className="border border-surface-800 bg-surface-950 overflow-hidden">
            {draft.coverUrl && (
              <div className="aspect-[16/9]">
                <NewsPhoto src={draft.coverUrl} alt="" />
              </div>
            )}
            <div className="p-5">
              <p className="news-serif text-2xl text-white leading-tight">{draft.title || "Titular"}</p>
              {draft.excerpt && <p className="text-sm text-surface-400 mt-2">{draft.excerpt}</p>}
            </div>
            <NewsHtmlBody html={previewHtml} />
          </div>
        </div>
      </div>
    </div>
  );
}
