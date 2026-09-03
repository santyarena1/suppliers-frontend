"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import BrandHtmlCanvas from "@/components/org/BrandHtmlCanvas";
import { getTenant } from "@/lib/auth";
import { assetUrl } from "@/lib/assets";
import { formatUSD } from "@/lib/format";
import {
  brandApi,
  type BrandAction,
  type BrandHub,
  type BrandModuleId,
  type BrandResource,
  type BrandSkuSignal,
} from "@/lib/api";
import { SIGNAL_LIGHT_CARD, SIGNAL_LIGHT_DOT, SIGNAL_LIGHT_LABELS } from "@/lib/brand-lights";
import { BRAND_MODULE_HINT, BRAND_MODULE_LABELS } from "@/lib/brand-presence";
import {
  Bell,
  Building2,
  Check,
  Clock,
  Download,
  ExternalLink,
  Globe,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquare,
  Package,
  Phone,
  Search,
  Target,
} from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const SECTIONS: { id: BrandModuleId; href: string; icon: typeof Package }[] = [
  { id: "products", href: "#productos", icon: Package },
  { id: "actions", href: "#acciones", icon: Target },
  { id: "materials", href: "#materiales", icon: Download },
  { id: "trainings", href: "#capacitaciones", icon: GraduationCap },
  { id: "contact", href: "#contacto", icon: Mail },
];

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

  const accent = hub?.theme.primaryColor || "#22c55e";
  const searchHref = hub
    ? `/search?marca=${encodeURIComponent(hub.name)}`
    : "/search";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-950">
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/marcas" className="text-xs text-surface-400 hover:text-white">
          ← Marcas conectadas
        </Link>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : aviso || !hub ? (
          <p className="text-sm text-red-400 px-6 py-10">{aviso ?? "No encontrado"}</p>
        ) : (
          <div>
            {hub.htmlDocument ? (
              <BrandHtmlCanvas
                html={hub.htmlDocument}
                minHeight={480}
                slots={{
                  productos: <SignalsBlock hub={hub} retailer={retailer} />,
                  semaforos: <SignalsBlock hub={hub} retailer={retailer} />,
                  acciones: <ActionsBlock hub={hub} />,
                  materiales: <FilesBlock title="Materiales" items={hub.materials} />,
                  capacitaciones: <FilesBlock title="Capacitaciones" items={hub.trainings} />,
                  hablar: (
                    <Link href={`/mensajes?linkId=${hub.linkId}`} className="text-sm underline">
                      Hablar con {hub.name}
                    </Link>
                  ),
                  nombre: <span>{hub.name}</span>,
                  logo: hub.theme.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(hub.theme.logoUrl)} alt={hub.name} style={{ height: 48 }} />
                  ) : null,
                  noticias: <HubNews items={hub.news ?? []} />,
                }}
              />
            ) : (
              <Hero hub={hub} accent={accent} />
            )}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
              {hub.status === "SUSPENDED" && (
                <p className="text-xs rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-200">
                  El vínculo está en pausa. Podés mirar el espacio, pero las operaciones pueden estar limitadas.
                </p>
              )}
              {!hub.htmlDocument && hub.presence.pending && (
                <p className="text-sm rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-100">
                  <span className="font-semibold">Pendiente de contenido.</span> Ya estás conectado con {hub.name}.
                  Todavía no publicó mapa, acciones ni materiales: cada bloque aparece abajo para que sepas qué
                  va a haber.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {retailer && (
                  <Link
                    href={searchHref}
                    className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 text-black"
                    style={{ background: accent }}
                  >
                    <Search className="w-4 h-4" /> Comprar en mis distros
                  </Link>
                )}
                <Link
                  href={`/mensajes?linkId=${hub.linkId}`}
                  className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 border border-surface-700 text-white hover:bg-surface-800"
                >
                  <MessageSquare className="w-4 h-4" /> Hablar con {hub.name}
                </Link>
                <Link
                  href="/avisos"
                  className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 border border-surface-700 text-white hover:bg-surface-800"
                >
                  <Bell className="w-4 h-4" /> Avisos
                </Link>
              </div>

              {!hub.htmlDocument && (
              <nav className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-surface-950/90 backdrop-blur border-b border-surface-800 flex gap-1 overflow-x-auto">
                {SECTIONS.map((s) => {
                  const ready = hub.presence.modules[s.id].ready;
                  const Icon = s.icon;
                  return (
                    <a
                      key={s.id}
                      href={s.href}
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-full px-3 py-1.5 whitespace-nowrap border ${
                        ready
                          ? "border-surface-700 text-surface-200 hover:border-surface-500"
                          : "border-dashed border-amber-500/30 text-amber-300/80"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {BRAND_MODULE_LABELS[s.id]}
                      {!ready && <Clock className="w-3 h-3" />}
                    </a>
                  );
                })}
              </nav>
              )}

              {(!hub.htmlSlots?.includes("productos") && !hub.htmlSlots?.includes("semaforos")) && (
                <ProductsSection hub={hub} retailer={retailer} searchHref={searchHref} />
              )}
              {!hub.htmlSlots?.includes("acciones") && <ActionsSection hub={hub} />}
              {!hub.htmlSlots?.includes("materiales") && (
              <FilesSection
                id="materiales"
                title="Materiales"
                module="materials"
                items={hub.materials}
                pendingText={`${hub.name} todavía no subió fichas ni catálogos. Cuando lo haga, aparecen acá para bajarlos.`}
              />
              )}
              {!hub.htmlSlots?.includes("capacitaciones") && (
              <FilesSection
                id="capacitaciones"
                title="Capacitaciones"
                module="trainings"
                items={hub.trainings}
                pendingText={`${hub.name} todavía no cargó cursos ni argumentarios. El bloque queda visible para cuando publique.`}
              />
              )}
              {!hub.htmlSlots?.includes("noticias") && (hub.news?.length ?? 0) > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-white mb-3">Noticias</h2>
                  <HubNews items={hub.news ?? []} />
                </section>
              )}
              {!hub.htmlDocument && <ContactSection hub={hub} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Hero({ hub, accent }: { hub: BrandHub; accent: string }) {
  const connected = hub.connectedAt
    ? new Date(hub.connectedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <div className="relative overflow-hidden border-b border-surface-800">
      {hub.theme.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(hub.theme.heroUrl)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
      ) : (
        <div
          className="absolute inset-0 opacity-50"
          style={{ background: `radial-gradient(ellipse at top left, ${accent}66, transparent 55%)` }}
        />
      )}
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 flex items-end gap-5">
        {hub.theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(hub.theme.logoUrl)}
            alt=""
            className="w-20 h-20 rounded-2xl object-contain bg-white/10 border border-white/10 shadow-xl"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-brand-400" />
          </div>
        )}
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {hub.presence.pending ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border border-amber-500/30 bg-amber-500/15 text-amber-300">
                <Clock className="w-3 h-3" /> Pendiente de contenido
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                <Check className="w-3 h-3" /> Conectada
              </span>
            )}
            <span className="text-[11px] text-surface-400">
              {hub.presence.readyCount}/{hub.presence.total} módulos publicados
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{hub.name}</h1>
          <p className="text-sm text-surface-300 mt-1 max-w-2xl">{hub.theme.headline || hub.theme.about}</p>
          {connected && <p className="text-[11px] text-surface-500 mt-2">Vinculada desde {connected}</p>}
        </div>
      </div>
    </div>
  );
}

function SignalsBlock({ hub, retailer }: { hub: BrandHub; retailer: boolean }) {
  if (hub.signals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-4 text-sm text-surface-300">
        Mapa pendiente
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {hub.signals.map((row) => (
        <SignalCard key={row.id} row={row} retailer={retailer} />
      ))}
    </div>
  );
}

function ActionsBlock({ hub }: { hub: BrandHub }) {
  if (hub.actions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-4 text-sm text-surface-300">
        Acciones pendientes
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {hub.actions.map((action) => (
        <ActionRow key={action.id} action={action} />
      ))}
    </ul>
  );
}

function FilesBlock({ title, items }: { title: string; items: BrandResource[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-4 text-sm text-surface-300">
        {title} pendiente
      </div>
    );
  }
  return (
    <ul className="grid sm:grid-cols-2 gap-2">
      {items.map((item) => {
        const href = item.fileUrl ? assetUrl(item.fileUrl) : item.contentUrl;
        if (!href) return null;
        return (
          <li key={item.id}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-xl border border-surface-800 bg-surface-900 px-4 py-3 hover:border-surface-600"
            >
              <Download className="w-4 h-4 text-brand-400 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{item.title}</p>
                {item.description && <p className="text-[11px] text-surface-400 line-clamp-2">{item.description}</p>}
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-surface-600 ml-auto" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ProductsSection({
  hub,
  retailer,
  searchHref,
}: {
  hub: BrandHub;
  retailer: boolean;
  searchHref: string;
}) {
  const ready = hub.presence.modules.products.ready;
  return (
    <section id="productos" className="scroll-mt-16">
      <SectionHead
        title="Mapa comercial"
        hint={BRAND_MODULE_HINT.products}
        ready={ready}
        count={hub.signals.length}
      />
      {!ready ? (
        <Pending
          text={`${hub.name} todavía no armó el mapa de SKUs. ${
            retailer
              ? "Igual podés buscarla en el catálogo de tus distribuidores: el vínculo ya está."
              : "Cuando publique semáforos, se ven acá."
          }`}
        >
          {retailer && (
            <Link href={searchHref} className="text-xs font-semibold text-brand-400">
              Abrir búsqueda filtrada →
            </Link>
          )}
        </Pending>
      ) : (
        <>
          <LightLegend />
          <div className="grid gap-2 sm:grid-cols-2">
            {hub.signals.map((row) => (
              <SignalCard key={row.id} row={row} retailer={retailer} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SignalCard({ row, retailer }: { row: BrandSkuSignal; retailer: boolean }) {
  const inner = (
    <>
      {row.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(row.imageUrl)} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/5" />
      ) : (
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SIGNAL_LIGHT_DOT[row.light]}`} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{row.name}</p>
        <p className="text-[11px] text-surface-400">
          {row.providerName}
          {row.sku ? ` · ${row.sku}` : ""} · {SIGNAL_LIGHT_LABELS[row.light]}
        </p>
        <p className="text-[11px] text-surface-300 mt-0.5">
          {row.suggestedPrice != null ? `Sugerido ${formatUSD(row.suggestedPrice)}` : "Sin precio sugerido"}
          {row.incomingAt ? ` · ingreso ${row.incomingAt.slice(0, 10)}` : ""}
        </p>
        {row.notes && <p className="text-[11px] text-surface-500 mt-0.5 line-clamp-2">{row.notes}</p>}
      </div>
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SIGNAL_LIGHT_DOT[row.light]}`} />
    </>
  );
  const cls = `flex items-center gap-3 rounded-xl border px-3 py-3 ${SIGNAL_LIGHT_CARD[row.light]}`;
  if (retailer) {
    return (
      <Link href={`/product/${row.provider}/${encodeURIComponent(row.externalId)}`} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function LightLegend() {
  return (
    <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-surface-400">
      {(Object.keys(SIGNAL_LIGHT_LABELS) as Array<keyof typeof SIGNAL_LIGHT_LABELS>).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${SIGNAL_LIGHT_DOT[k]}`} />
          {SIGNAL_LIGHT_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

function ActionsSection({ hub }: { hub: BrandHub }) {
  const ready = hub.presence.modules.actions.ready;
  return (
    <section id="acciones" className="scroll-mt-16">
      <SectionHead title="Acciones vigentes" hint={BRAND_MODULE_HINT.actions} ready={ready} count={hub.actions.length} />
      {!ready ? (
        <Pending text={`${hub.name} no tiene acciones vigentes. Cuando lance una (unidades, USD o rebate), se mide acá sobre tus pedidos.`} />
      ) : (
        <ul className="flex flex-col gap-2">
          {hub.actions.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActionRow({ action }: { action: BrandAction }) {
  const unit = action.kind === "PURCHASE_AMOUNT" ? "USD" : "u.";
  const current =
    action.kind === "PURCHASE_AMOUNT" ? formatUSD(action.progress.current) : String(action.progress.current);
  const target = action.progress.target == null ? "—" : action.kind === "PURCHASE_AMOUNT" ? formatUSD(action.progress.target) : String(action.progress.target);
  const ends = new Date(action.endsAt).toLocaleDateString("es-AR");
  return (
    <li className="rounded-xl border border-surface-800 bg-surface-900 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{action.title}</p>
          {action.description && <p className="text-xs text-surface-400 mt-0.5">{action.description}</p>}
          <p className="text-[11px] text-surface-500 mt-1">Hasta {ends}</p>
        </div>
        <span className="text-[11px] tabular-nums text-surface-300">
          {current} / {target} {action.kind === "PURCHASE_AMOUNT" ? "" : unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden mt-2">
        <div
          className={`h-full ${action.progress.met ? "bg-emerald-500" : "bg-brand-500"}`}
          style={{ width: `${Math.round(Math.min(1, action.progress.ratio) * 100)}%` }}
        />
      </div>
    </li>
  );
}

function FilesSection({
  id,
  title,
  module,
  items,
  pendingText,
}: {
  id: string;
  title: string;
  module: "materials" | "trainings";
  items: BrandResource[];
  pendingText: string;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <SectionHead title={title} hint={BRAND_MODULE_HINT[module]} ready={items.length > 0} count={items.length} />
      {items.length === 0 ? (
        <Pending text={pendingText} />
      ) : (
        <ul className="grid sm:grid-cols-2 gap-2">
          {items.map((item) => {
            const href = item.fileUrl ? assetUrl(item.fileUrl) : item.contentUrl;
            if (!href) return null;
            return (
              <li key={item.id}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-surface-800 bg-surface-900 px-4 py-3 hover:border-surface-600"
                >
                  <Download className="w-4 h-4 text-brand-400 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{item.title}</p>
                    {item.description && <p className="text-[11px] text-surface-400 line-clamp-2">{item.description}</p>}
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-surface-600 ml-auto" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ContactSection({ hub }: { hub: BrandHub }) {
  const ready = hub.presence.modules.contact.ready;
  const c = hub.contact;
  return (
    <section id="contacto" className="scroll-mt-16 pb-8">
      <SectionHead title="Contacto" hint={BRAND_MODULE_HINT.contact} ready={ready} />
      {!ready ? (
        <Pending text={`${hub.name} no publicó mail, teléfono ni web. Mientras tanto, el canal es el chat de Nodo.`}>
          <Link href={`/mensajes?linkId=${hub.linkId}`} className="text-xs font-semibold text-brand-400">
            Abrir chat →
          </Link>
        </Pending>
      ) : (
        <div className="rounded-xl border border-surface-800 bg-surface-900 divide-y divide-surface-800">
          {c.supportEmail && (
            <a href={`mailto:${c.supportEmail}`} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-800/60">
              <Mail className="w-4 h-4 text-brand-400" /> {c.supportEmail}
            </a>
          )}
          {c.supportPhone && (
            <a href={`tel:${c.supportPhone}`} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-800/60">
              <Phone className="w-4 h-4 text-brand-400" /> {c.supportPhone}
            </a>
          )}
          {c.websiteUrl && (
            <a href={c.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-800/60">
              <Globe className="w-4 h-4 text-brand-400" /> {c.websiteUrl}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function SectionHead({
  title,
  hint,
  ready,
  count,
}: {
  title: string;
  hint: string;
  ready: boolean;
  count?: number;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-[11px] text-surface-500">{hint}</p>
      </div>
      {ready ? (
        <span className="text-[11px] text-emerald-400 tabular-nums">{count != null ? count : "Listo"}</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
          <Clock className="w-3 h-3" /> Pendiente
        </span>
      )}
    </div>
  );
}

function Pending({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-5">
      <p className="text-sm text-surface-300">{text}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function HubNews({ items }: { items: BrandHub["news"] }) {
  if (!items?.length) return <p className="text-sm text-surface-400">Todavía no hay notas.</p>;
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {items.map((item) => (
        <Link key={item.id} href={`/noticias/${item.id}`} className="block group">
          {item.coverUrl && (
            <div className="aspect-[16/10] overflow-hidden mb-2 bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(item.coverUrl)} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <p className="text-sm text-white leading-snug group-hover:opacity-80">{item.title}</p>
        </Link>
      ))}
    </div>
  );
}
