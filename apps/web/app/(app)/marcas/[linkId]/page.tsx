"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import { getTenant } from "@/lib/auth";
import { assetUrl } from "@/lib/assets";
import { brandApi, type BrandHub, type BrandHubHtmlPart, type BrandResource } from "@/lib/api";
import { SIGNAL_LIGHT_CARD, SIGNAL_LIGHT_DOT, SIGNAL_LIGHT_LABELS } from "@/lib/brand-lights";
import { Building2, Download, Loader2, MessageSquare, Search } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function BrandHubPage() {
  const params = useParams<{ linkId: string }>();
  const linkId = params?.linkId;
  const tenant = getTenant();
  const retailer = tenant?.type === "RETAILER";
  const [hub, setHub] = useState<BrandHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!linkId) return;
    brandApi
      .hub(linkId)
      .then((res) => setHub(res.data))
      .catch((err) => setAviso(errMsg(err, "No se pudo abrir el espacio de la marca")))
      .finally(() => setLoading(false));
  }, [linkId]);

  const theme = hub?.theme;
  const bg = theme?.backgroundColor || undefined;
  const fg = theme?.textColor || undefined;
  const accent = theme?.primaryColor || undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: bg, color: fg, fontFamily: theme?.fontFamily || undefined }}>
      <header className="flex-shrink-0 border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/marcas" className="text-xs opacity-70 hover:opacity-100">
          ← Marcas
        </Link>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin opacity-60" />
          </div>
        ) : aviso || !hub ? (
          <p className="text-sm text-red-400 px-6 py-10">{aviso ?? "No encontrado"}</p>
        ) : (
          <div>
            {theme?.heroUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(theme.heroUrl)} alt="" className="w-full h-40 object-cover" />
            )}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
              <div className="flex items-start gap-4">
                {theme?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(theme.logoUrl)} alt="" className="w-16 h-16 rounded-xl object-contain bg-white/10" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
                    <Building2 className="w-7 h-7 opacity-70" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold" style={{ color: accent || fg }}>{hub.name}</h1>
                  <p className="text-sm opacity-70 mt-1">{theme?.headline || theme?.about}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {retailer && (
                    <Link
                      href={`/search?marca=${encodeURIComponent(hub.name)}&q=${encodeURIComponent(hub.name)}`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 text-black"
                      style={{ background: accent || "#22c55e" }}
                    >
                      <Search className="w-3.5 h-3.5" /> Ver productos en búsqueda
                    </Link>
                  )}
                  <Link
                    href={`/mensajes?linkId=${hub.linkId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 border border-white/20"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Hablar
                  </Link>
                </div>
              </div>

              <HubParts hub={hub} retailer={retailer} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HubParts({ hub, retailer }: { hub: BrandHub; retailer: boolean }) {
  const used = new Set(hub.htmlParts.filter((p) => p.type === "slot").map((p) => p.name));
  const extras = (
    <>
      {!used.has("semaforos") && !used.has("productos") && <SignalsBlock hub={hub} retailer={retailer} />}
      {!used.has("acciones") && <ActionsBlock hub={hub} />}
      {!used.has("materiales") && <FilesBlock title="Materiales" items={hub.materials} />}
      {!used.has("capacitaciones") && <FilesBlock title="Capacitaciones" items={hub.trainings} />}
    </>
  );
  if (hub.htmlParts.length === 0) return <div className="flex flex-col gap-6">{extras}</div>;
  return (
    <div className="flex flex-col gap-6">
      {hub.htmlParts.map((part, i) => (
        <HubPart key={i} part={part} hub={hub} retailer={retailer} />
      ))}
      {extras}
    </div>
  );
}

function HubPart({ part, hub, retailer }: { part: BrandHubHtmlPart; hub: BrandHub; retailer: boolean }) {
  if (part.type === "html") {
    return <div className="brand-html prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: part.html || "" }} />;
  }
  if (part.name === "nombre") return <span className="text-xl font-bold">{hub.name}</span>;
  if (part.name === "logo" && hub.theme.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={assetUrl(hub.theme.logoUrl)} alt={hub.name} className="h-12 object-contain" />
    );
  }
  if (part.name === "productos" || part.name === "semaforos") return <SignalsBlock hub={hub} retailer={retailer} />;
  if (part.name === "acciones") return <ActionsBlock hub={hub} />;
  if (part.name === "materiales") return <FilesBlock title="Materiales" items={hub.materials} />;
  if (part.name === "capacitaciones") return <FilesBlock title="Capacitaciones" items={hub.trainings} />;
  if (part.name === "hablar") {
    return (
      <Link href={`/mensajes?linkId=${hub.linkId}`} className="text-sm underline">
        Hablar con {hub.name}
      </Link>
    );
  }
  return null;
}

function SignalsBlock({ hub, retailer }: { hub: BrandHub; retailer: boolean }) {
  if (hub.signals.length === 0) {
    return (
      <p className="text-sm opacity-60">
        La marca todavía no armó el mapa de productos. {retailer ? "Podés buscarla igual en el catálogo de tus distros." : ""}
      </p>
    );
  }
  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">Mapa comercial</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {hub.signals.map((row) => {
          const inner = (
            <>
              <span className={`w-2.5 h-2.5 rounded-full ${SIGNAL_LIGHT_DOT[row.light]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{row.name}</p>
                <p className="text-[11px] opacity-60">
                  {row.providerName} {row.sku ? `· ${row.sku}` : ""} · {SIGNAL_LIGHT_LABELS[row.light]}
                  {row.suggestedPrice != null ? ` · sug. ${row.suggestedPrice}` : ""}
                  {row.incomingAt ? ` · ingreso ${row.incomingAt.slice(0, 10)}` : ""}
                </p>
              </div>
            </>
          );
          const cls = `flex items-center gap-3 rounded-xl border px-3 py-2.5 ${SIGNAL_LIGHT_CARD[row.light]}`;
          if (retailer) {
            return (
              <Link key={row.id} href={`/product/${row.provider}/${encodeURIComponent(row.externalId)}`} className={cls}>
                {inner}
              </Link>
            );
          }
          return (
            <div key={row.id} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionsBlock({ hub }: { hub: BrandHub }) {
  if (hub.actions.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">Acciones vigentes</h2>
      <ul className="flex flex-col gap-2">
        {hub.actions.map((action) => (
          <li key={action.id} className="rounded-xl border border-white/10 px-3 py-2">
            <p className="text-sm font-medium">{action.title}</p>
            {action.description && <p className="text-xs opacity-70 mt-0.5">{action.description}</p>}
            <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-2">
              <div className="h-full bg-white/70" style={{ width: `${Math.round(action.progress.ratio * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilesBlock({ title, items }: { title: string; items: BrandResource[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const href = item.fileUrl ? assetUrl(item.fileUrl) : item.contentUrl;
          if (!href) return null;
          return (
            <li key={item.id}>
              <a href={href} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-2 hover:underline">
                <Download className="w-3.5 h-3.5" /> {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
