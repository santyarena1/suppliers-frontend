"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { assetUrl } from "@/lib/assets";
import { formatUSD } from "@/lib/format";
import type {
  BrandAction,
  BrandHub,
  BrandModuleId,
  BrandPresence,
  BrandResource,
  BrandSkuSignal,
} from "@/lib/api";
import { SIGNAL_LIGHT_CARD, SIGNAL_LIGHT_DOT, SIGNAL_LIGHT_LABELS } from "@/lib/brand-lights";
import { BRAND_MODULE_HINT } from "@/lib/brand-presence";
import { brandHtmlCoversModule, collectBrandVisuals, isVisualAsset } from "@/lib/brand-visuals";
import {
  Bell,
  Building2,
  Check,
  Clock,
  Download,
  ExternalLink,
  Globe,
  GraduationCap,
  Mail,
  MessageSquare,
  Newspaper,
  Package,
  Phone,
  Search,
  Target,
} from "lucide-react";

const SECTIONS: { href: string; icon: typeof Package; label: string; module?: BrandModuleId }[] = [
  { href: "#productos", icon: Package, label: "Productos", module: "products" },
  { href: "#acciones", icon: Target, label: "Acciones", module: "actions" },
  { href: "#novedades", icon: Newspaper, label: "Novedades" },
  { href: "#materiales", icon: Download, label: "Materiales", module: "materials" },
  { href: "#capacitaciones", icon: GraduationCap, label: "Capacitaciones", module: "trainings" },
  { href: "#contacto", icon: Mail, label: "Contacto", module: "contact" },
];

function img(ref?: string | null) {
  return assetUrl(ref);
}

type ExtraBlock = { title?: string; body?: string; url?: string };

type PublicProduct = { name: string; imageUrl: string | null };
type PublicAction = { title: string; description: string | null; startsAt: string; endsAt: string };
type PublicNews = {
  id: string;
  publicKey?: string;
  title: string;
  excerpt?: string;
  coverUrl: string | null;
  publishedAt?: string | null;
};
type PublicFile = { title: string; description: string | null };

export function BrandSpaceLanding({
  name,
  accent = "#22c55e",
  theme,
  contact,
  products = [],
  actions = [],
  news = [],
  materials = [],
  trainings = [],
  html,
  htmlSlots,
  presence,
  connectedAt,
  status,
  retailer = false,
  searchHref,
  chatHref,
  noticesHref,
  variant,
  extraBlocks = [],
}: {
  name: string;
  accent?: string;
  theme: {
    logoUrl: string | null;
    heroUrl: string | null;
    headline: string | null;
    about: string | null;
  };
  contact: {
    websiteUrl: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  };
  products?: BrandSkuSignal[] | PublicProduct[];
  actions?: BrandAction[] | PublicAction[];
  news?: BrandHub["news"] | PublicNews[];
  materials?: BrandResource[] | PublicFile[];
  trainings?: BrandResource[] | PublicFile[];
  html?: ReactNode;
  htmlSlots?: string[];
  presence?: BrandPresence;
  connectedAt?: string;
  status?: string;
  retailer?: boolean;
  searchHref?: string;
  chatHref?: string;
  noticesHref?: string;
  variant: "hub" | "public";
  extraBlocks?: ExtraBlock[];
}) {
  const hub = variant === "hub";
  const visuals = collectBrandVisuals({
    heroUrl: theme.heroUrl,
    products: products.map((p) => ({ imageUrl: p.imageUrl })),
    news: news.map((n) => ({ coverUrl: n.coverUrl })),
    materials: materials as Array<{ type?: string; fileUrl?: string | null; contentUrl?: string | null }>,
  }).map(img).filter(Boolean);

  const showProducts = !brandHtmlCoversModule(htmlSlots, "products");
  const showActions = !brandHtmlCoversModule(htmlSlots, "actions");
  const showNews = !brandHtmlCoversModule(htmlSlots, "news");
  const showMaterials = !brandHtmlCoversModule(htmlSlots, "materials");
  const showTrainings = !brandHtmlCoversModule(htmlSlots, "trainings");

  return (
    <div className="bg-surface-950 text-white">
      <Hero
        name={name}
        accent={accent}
        theme={theme}
        visuals={visuals}
        presence={presence}
        connectedAt={connectedAt}
        retailer={retailer}
        searchHref={searchHref}
        chatHref={chatHref}
        noticesHref={noticesHref}
        hub={hub}
      />

      {status === "SUSPENDED" && (
        <p className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 text-xs rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-200">
          El vínculo está en pausa. Podés mirar el espacio, pero las operaciones pueden estar limitadas.
        </p>
      )}
      {hub && presence?.pending && (
        <p className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 text-sm rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-100">
          <span className="font-semibold">Pendiente de contenido.</span> Ya estás conectado con {name}. Todavía no
          publicó mapa, acciones ni materiales: cada bloque aparece abajo para que sepas qué va a haber.
        </p>
      )}

      <nav className="sticky top-0 z-20 border-b border-surface-800 bg-surface-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex gap-1 overflow-x-auto">
          {SECTIONS.map((s) => {
            const ready = s.module
              ? presence
                ? presence.modules[s.module].ready
                : sectionHasContent(s.module, products, actions, materials, trainings, contact)
              : news.length > 0;
            const Icon = s.icon;
            return (
              <a
                key={s.href}
                href={s.href}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-full px-3 py-1.5 whitespace-nowrap border ${
                  ready
                    ? "border-surface-700 text-surface-200 hover:border-surface-500"
                    : "border-dashed border-amber-500/30 text-amber-300/80"
                }`}
              >
                <Icon className="w-3 h-3" />
                {s.label}
                {!ready && hub && <Clock className="w-3 h-3" />}
              </a>
            );
          })}
        </div>
      </nav>

      {html ? <div className="border-b border-surface-800">{html}</div> : null}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-14">
        {showProducts && (
          <ProductsSection
            name={name}
            products={products}
            retailer={retailer}
            searchHref={searchHref}
            hub={hub}
            ready={presence?.modules.products.ready ?? products.length > 0}
          />
        )}
        {showActions && (
          <ActionsSection
            name={name}
            actions={actions}
            hub={hub}
            ready={presence?.modules.actions.ready ?? actions.length > 0}
          />
        )}
        {showNews && <NewsSection name={name} items={news} hub={hub} />}
        {showMaterials && (
          <FilesSection
            id="materiales"
            title="Materiales"
            module="materials"
            items={materials}
            pendingText={`${name} todavía no subió fichas ni catálogos. Cuando lo haga, aparecen acá para bajarlos.`}
            hub={hub}
          />
        )}
        {showTrainings && (
          <FilesSection
            id="capacitaciones"
            title="Capacitaciones"
            module="trainings"
            items={trainings}
            pendingText={`${name} todavía no cargó cursos ni argumentarios. El bloque queda visible para cuando publique.`}
            hub={hub}
          />
        )}
        {extraBlocks.length > 0 && (
          <section className="grid gap-4 sm:grid-cols-2">
            {extraBlocks.map((block, i) => (
              <article key={i} className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
                {block.title && <h2 className="text-sm font-semibold text-white mb-2">{block.title}</h2>}
                {block.body && <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">{block.body}</p>}
                {block.url && (
                  <a href={block.url} className="inline-flex items-center gap-1 text-xs text-brand-400 mt-3" target="_blank" rel="noreferrer">
                    <Globe className="w-3 h-3" /> Más info
                  </a>
                )}
              </article>
            ))}
          </section>
        )}
        <ContactSection
          name={name}
          contact={contact}
          chatHref={chatHref}
          hub={hub}
          ready={presence?.modules.contact.ready ?? Boolean(contact.supportEmail || contact.supportPhone || contact.websiteUrl)}
        />
      </div>
    </div>
  );
}

function sectionHasContent(
  module: BrandModuleId,
  products: unknown[],
  actions: unknown[],
  materials: unknown[],
  trainings: unknown[],
  contact: { websiteUrl: string | null; supportEmail: string | null; supportPhone: string | null }
) {
  if (module === "products") return products.length > 0;
  if (module === "actions") return actions.length > 0;
  if (module === "materials") return materials.length > 0;
  if (module === "trainings") return trainings.length > 0;
  if (module === "contact") return Boolean(contact.supportEmail || contact.supportPhone || contact.websiteUrl);
  return true;
}

function Hero({
  name,
  accent,
  theme,
  visuals,
  presence,
  connectedAt,
  retailer,
  searchHref,
  chatHref,
  noticesHref,
  hub,
}: {
  name: string;
  accent: string;
  theme: { logoUrl: string | null; heroUrl: string | null; headline: string | null; about: string | null };
  visuals: string[];
  presence?: BrandPresence;
  connectedAt?: string;
  retailer: boolean;
  searchHref?: string;
  chatHref?: string;
  noticesHref?: string;
  hub: boolean;
}) {
  const connected = connectedAt
    ? new Date(connectedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  return (
    <section className="relative overflow-hidden min-h-[22rem] sm:min-h-[28rem] border-b border-surface-800">
      <HeroVisuals urls={visuals} accent={accent} />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/75 to-black/35" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-5">
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img(theme.logoUrl)}
              alt=""
              className="w-24 h-24 rounded-3xl object-contain bg-white/10 border border-white/15 shadow-2xl backdrop-blur"
            />
          ) : (
            <div className="w-24 h-24 rounded-3xl bg-surface-800/80 border border-white/10 flex items-center justify-center">
              <Building2 className="w-10 h-10 text-white/70" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {hub && presence && (
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {presence.pending ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border border-amber-500/30 bg-amber-500/15 text-amber-300">
                    <Clock className="w-3 h-3" /> Pendiente de contenido
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                    <Check className="w-3 h-3" /> Conectada
                  </span>
                )}
                <span className="text-[11px] text-white/60">
                  {presence.readyCount}/{presence.total} módulos publicados
                </span>
              </div>
            )}
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/70 mb-1">{name}</p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">{theme.headline || name}</h1>
            {theme.about && <p className="mt-3 text-sm sm:text-base text-white/80 max-w-2xl leading-relaxed">{theme.about}</p>}
            {connected && <p className="text-[11px] text-white/50 mt-3">Vinculada desde {connected}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {retailer && searchHref && (
            <Link
              href={searchHref}
              className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 text-black"
              style={{ background: accent }}
            >
              <Search className="w-4 h-4" /> Comprar en mis distros
            </Link>
          )}
          {chatHref && (
            <Link
              href={chatHref}
              className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 border border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              <MessageSquare className="w-4 h-4" /> Hablar con {name}
            </Link>
          )}
          {noticesHref && (
            <Link
              href={noticesHref}
              className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 border border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              <Bell className="w-4 h-4" /> Avisos
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroVisuals({ urls, accent }: { urls: string[]; accent: string }) {
  if (urls.length === 0) {
    return (
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}88, transparent 55%), #0b1220` }}
      />
    );
  }
  if (urls.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={urls[0]} alt="" className="absolute inset-0 w-full h-full object-cover" />
    );
  }
  const lead = urls[0];
  const rest = urls.slice(1, 5);
  return (
    <div className="absolute inset-0 grid grid-cols-2 sm:grid-cols-4 grid-rows-2 gap-0.5 bg-black">
      <div className="col-span-2 row-span-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lead} alt="" className="w-full h-full object-cover" />
      </div>
      {rest.map((src) => (
        <div key={src} className="hidden sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
}

export function ProductsSection({
  name,
  products,
  retailer,
  searchHref,
  hub,
  ready,
}: {
  name: string;
  products: BrandSkuSignal[] | PublicProduct[];
  retailer: boolean;
  searchHref?: string;
  hub: boolean;
  ready: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? products : products.slice(0, 12);
  return (
    <section id="productos" className="scroll-mt-16">
      <SectionHead
        title={hub ? "Mapa comercial" : "Productos"}
        hint={hub ? BRAND_MODULE_HINT.products : "Nombre e imagen. El precio y el semáforo quedan para el espacio vinculado."}
        ready={ready}
        count={products.length}
      />
      {!ready ? (
        <Pending
          text={
            hub
              ? `${name} todavía no armó el mapa de SKUs. ${
                  retailer
                    ? "Igual podés buscarla en el catálogo de tus distribuidores: el vínculo ya está."
                    : "Cuando publique semáforos, se ven acá."
                }`
              : `${name} todavía no mostró productos en esta página.`
          }
        >
          {retailer && searchHref && (
            <Link href={searchHref} className="text-xs font-semibold text-brand-400">
              Abrir búsqueda filtrada →
            </Link>
          )}
        </Pending>
      ) : (
        <>
          {hub && isSignalList(products) && <LightLegend />}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {list.map((row, i) =>
              isSignal(row) ? (
                <SignalCard key={row.id} row={row} retailer={retailer} />
              ) : (
                <PublicProductCard key={`${row.name}-${i}`} row={row} />
              )
            )}
          </div>
          {products.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 text-xs font-semibold text-brand-400"
            >
              {showAll ? "Ver menos" : `Ver los ${products.length} productos`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function isSignal(row: BrandSkuSignal | PublicProduct): row is BrandSkuSignal {
  return "light" in row && "id" in row;
}

function isSignalList(rows: BrandSkuSignal[] | PublicProduct[]): rows is BrandSkuSignal[] {
  return rows.length > 0 && isSignal(rows[0]);
}

function SignalCard({ row, retailer }: { row: BrandSkuSignal; retailer: boolean }) {
  const inner = (
    <>
      <div className="relative aspect-square bg-black/40 overflow-hidden">
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(row.imageUrl)} alt="" className="w-full h-full object-contain p-3" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-white/25" />
          </div>
        )}
        <span className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-black/40 ${SIGNAL_LIGHT_DOT[row.light]}`} />
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-white line-clamp-2 min-h-[2.5rem]">{row.name}</p>
        <p className="text-[11px] text-surface-400 mt-1">{SIGNAL_LIGHT_LABELS[row.light]}</p>
        <p className="text-[11px] text-surface-300 mt-0.5">
          {row.suggestedPrice != null ? `Sugerido ${formatUSD(row.suggestedPrice)}` : "Sin precio sugerido"}
        </p>
      </div>
    </>
  );
  const cls = `block rounded-2xl overflow-hidden border ${SIGNAL_LIGHT_CARD[row.light]} hover:brightness-110`;
  if (retailer) {
    return (
      <Link href={`/product/${row.provider}/${encodeURIComponent(row.externalId)}`} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function PublicProductCard({ row }: { row: PublicProduct }) {
  return (
    <article className="rounded-2xl overflow-hidden border border-surface-800 bg-surface-900">
      <div className="aspect-square bg-black/40">
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(row.imageUrl)} alt="" className="w-full h-full object-contain p-3" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-white/25" />
          </div>
        )}
      </div>
      <p className="p-3 text-sm font-medium text-white line-clamp-2">{row.name}</p>
    </article>
  );
}

function LightLegend() {
  return (
    <div className="flex flex-wrap gap-3 mb-4 text-[11px] text-surface-400">
      {(Object.keys(SIGNAL_LIGHT_LABELS) as Array<keyof typeof SIGNAL_LIGHT_LABELS>).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${SIGNAL_LIGHT_DOT[k]}`} />
          {SIGNAL_LIGHT_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

export function ActionsSection({
  name,
  actions,
  hub,
  ready,
}: {
  name: string;
  actions: BrandAction[] | PublicAction[];
  hub: boolean;
  ready: boolean;
}) {
  return (
    <section id="acciones" className="scroll-mt-16">
      <SectionHead
        title="Acciones vigentes"
        hint={hub ? BRAND_MODULE_HINT.actions : "Título y vigencia. El progreso se ve en el espacio vinculado."}
        ready={ready}
        count={actions.length}
      />
      {!ready ? (
        <Pending
          text={
            hub
              ? `${name} no tiene acciones vigentes. Cuando lance una (unidades, USD o rebate), se mide acá sobre tus pedidos.`
              : `${name} no tiene acciones publicadas en esta página.`
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {actions.map((action, i) =>
            isHubAction(action) ? (
              <ActionRow key={action.id} action={action} />
            ) : (
              <li key={`${action.title}-${i}`} className="rounded-2xl border border-surface-800 bg-surface-900 px-4 py-4">
                <p className="text-sm font-medium text-white">{action.title}</p>
                {action.description && <p className="text-xs text-surface-400 mt-1">{action.description}</p>}
                <p className="text-[11px] text-surface-500 mt-2">Hasta {new Date(action.endsAt).toLocaleDateString("es-AR")}</p>
              </li>
            )
          )}
        </ul>
      )}
    </section>
  );
}

function isHubAction(action: BrandAction | PublicAction): action is BrandAction {
  return "progress" in action && "id" in action;
}

function ActionRow({ action }: { action: BrandAction }) {
  const unit = action.kind === "PURCHASE_AMOUNT" ? "USD" : "u.";
  const current =
    action.kind === "PURCHASE_AMOUNT" ? formatUSD(action.progress.current) : String(action.progress.current);
  const target =
    action.progress.target == null
      ? "—"
      : action.kind === "PURCHASE_AMOUNT"
        ? formatUSD(action.progress.target)
        : String(action.progress.target);
  const ends = new Date(action.endsAt).toLocaleDateString("es-AR");
  return (
    <li className="rounded-2xl border border-surface-800 bg-surface-900 px-4 py-4">
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

export function NewsSection({
  name,
  items,
  hub,
}: {
  name: string;
  items: BrandHub["news"] | PublicNews[];
  hub: boolean;
}) {
  const ready = items.length > 0;
  const featured = items[0];
  const rest = items.slice(1);
  return (
    <section id="novedades" className="scroll-mt-16">
      <SectionHead title="Novedades" hint="Notas que publica la marca para el canal" ready={ready} count={items.length} />
      {!ready ? (
        <Pending text={`${name} todavía no publicó notas. Cuando salga un lanzamiento o una promo, aparece acá.`} />
      ) : (
        <div className="flex flex-col gap-4">
          {featured && <NewsFeatured item={featured} hub={hub} />}
          {rest.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-4">
              {rest.map((item) => (
                <NewsCard key={item.id} item={item} hub={hub} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function newsHref(item: PublicNews, hub: boolean) {
  if (hub) return `/noticias/${item.id}`;
  if (item.publicKey) return `/n/${item.publicKey}`;
  return null;
}

function NewsFeatured({ item, hub }: { item: PublicNews; hub: boolean }) {
  const href = newsHref(item, hub);
  const body = (
    <article className="grid sm:grid-cols-2 gap-0 rounded-2xl overflow-hidden border border-surface-800 bg-surface-900 group">
      <div className="aspect-[16/10] sm:aspect-auto sm:min-h-[220px] bg-black/40">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(item.coverUrl)} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
        ) : (
          <div className="w-full h-full min-h-[180px] flex items-center justify-center">
            <Newspaper className="w-10 h-10 text-white/20" />
          </div>
        )}
      </div>
      <div className="p-5 sm:p-6 flex flex-col justify-center">
        <p className="text-[11px] uppercase tracking-widest text-surface-500 mb-2">Destacada</p>
        <h3 className="text-xl font-semibold text-white leading-snug group-hover:opacity-80">{item.title}</h3>
        {item.excerpt && <p className="text-sm text-surface-400 mt-2 line-clamp-3">{item.excerpt}</p>}
      </div>
    </article>
  );
  if (!href) return body;
  return <Link href={href}>{body}</Link>;
}

function NewsCard({ item, hub }: { item: PublicNews; hub: boolean }) {
  const href = newsHref(item, hub);
  const body = (
    <article className="block group rounded-2xl overflow-hidden border border-surface-800 bg-surface-900">
      <div className="aspect-[16/10] bg-black/40 overflow-hidden">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(item.coverUrl)} alt="" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Newspaper className="w-7 h-7 text-white/20" />
          </div>
        )}
      </div>
      <p className="p-3 text-sm text-white leading-snug group-hover:opacity-80 line-clamp-2">{item.title}</p>
    </article>
  );
  if (!href) return body;
  return <Link href={href}>{body}</Link>;
}

export function FilesSection({
  id,
  title,
  module,
  items,
  pendingText,
  hub,
}: {
  id: string;
  title: string;
  module: "materials" | "trainings";
  items: BrandResource[] | PublicFile[];
  pendingText: string;
  hub: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      <SectionHead title={title} hint={BRAND_MODULE_HINT[module]} ready={items.length > 0} count={items.length} />
      {items.length === 0 ? (
        <Pending text={pendingText} />
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item, i) => {
            const res = isResource(item) ? item : null;
            const href = hub && res ? (res.fileUrl ? img(res.fileUrl) : res.contentUrl) : null;
            const visual = res && isVisualAsset(res.type, res.fileUrl || res.contentUrl) ? img(res.fileUrl || res.contentUrl) : null;
            const inner = (
              <>
                {visual ? (
                  <div className="aspect-[16/10] bg-black/40 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={visual} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : null}
                <div className="flex items-start gap-3 px-4 py-3">
                  <Download className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{item.title}</p>
                    {item.description && <p className="text-[11px] text-surface-400 line-clamp-2">{item.description}</p>}
                  </div>
                  {href && <ExternalLink className="w-3.5 h-3.5 text-surface-600 ml-auto flex-shrink-0" />}
                </div>
              </>
            );
            return (
              <li key={res?.id ?? `${item.title}-${i}`}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-surface-800 bg-surface-900 overflow-hidden hover:border-surface-600"
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="rounded-2xl border border-surface-800 bg-surface-900 overflow-hidden">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function isResource(item: BrandResource | PublicFile): item is BrandResource {
  return "id" in item && "kind" in item;
}

export function ContactSection({
  name,
  contact,
  chatHref,
  hub,
  ready,
}: {
  name: string;
  contact: { websiteUrl: string | null; supportEmail: string | null; supportPhone: string | null };
  chatHref?: string;
  hub: boolean;
  ready: boolean;
}) {
  return (
    <section id="contacto" className="scroll-mt-16 pb-8">
      <SectionHead title="Contacto" hint={BRAND_MODULE_HINT.contact} ready={ready} />
      {!ready ? (
        <Pending
          text={
            hub
              ? `${name} no publicó mail, teléfono ni web. Mientras tanto, el canal es el chat de Nodo.`
              : `¿Sos un comercio y querés trabajar con ${name}? Pedí un código de vinculación. En NODO la marca no se descubre sola.`
          }
        >
          {chatHref && (
            <Link href={chatHref} className="text-xs font-semibold text-brand-400">
              Abrir chat →
            </Link>
          )}
        </Pending>
      ) : (
        <div className="rounded-2xl border border-surface-800 bg-surface-900 divide-y divide-surface-800">
          {contact.supportEmail && (
            <a href={`mailto:${contact.supportEmail}`} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-800/60">
              <Mail className="w-4 h-4 text-brand-400" /> {contact.supportEmail}
            </a>
          )}
          {contact.supportPhone && (
            <a href={`tel:${contact.supportPhone}`} className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-800/60">
              <Phone className="w-4 h-4 text-brand-400" /> {contact.supportPhone}
            </a>
          )}
          {contact.websiteUrl && (
            <a href={contact.websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-surface-800/60">
              <Globe className="w-4 h-4 text-brand-400" /> {contact.websiteUrl}
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
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
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

/** Rellenos compactos para huecos del HTML propio (Tailwind aplica: van en light DOM). */
export function brandHubSlotModules({
  hub,
  retailer,
}: {
  hub: BrandHub;
  retailer: boolean;
}) {
  const searchHref = `/search?marca=${encodeURIComponent(hub.name)}`;
  return {
    productos: (
      <ProductsSection
        name={hub.name}
        products={hub.signals}
        retailer={retailer}
        searchHref={searchHref}
        hub
        ready={hub.presence.modules.products.ready}
      />
    ),
    semaforos: (
      <ProductsSection
        name={hub.name}
        products={hub.signals}
        retailer={retailer}
        searchHref={searchHref}
        hub
        ready={hub.presence.modules.products.ready}
      />
    ),
    acciones: (
      <ActionsSection name={hub.name} actions={hub.actions} hub ready={hub.presence.modules.actions.ready} />
    ),
    materiales: (
      <FilesSection
        id="materiales"
        title="Materiales"
        module="materials"
        items={hub.materials}
        pendingText={`${hub.name} todavía no subió fichas ni catálogos.`}
        hub
      />
    ),
    capacitaciones: (
      <FilesSection
        id="capacitaciones"
        title="Capacitaciones"
        module="trainings"
        items={hub.trainings}
        pendingText={`${hub.name} todavía no cargó cursos ni argumentarios.`}
        hub
      />
    ),
    hablar: (
      <Link href={`/mensajes?linkId=${hub.linkId}`} className="text-sm underline text-white">
        Hablar con {hub.name}
      </Link>
    ),
    nombre: <span>{hub.name}</span>,
    logo: hub.theme.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img(hub.theme.logoUrl)} alt={hub.name} style={{ height: 48 }} />
    ) : null,
    noticias: <NewsSection name={hub.name} items={hub.news ?? []} hub />,
    novedades: <NewsSection name={hub.name} items={hub.news ?? []} hub />,
  };
}
