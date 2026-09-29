"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { assetUrl } from "@/lib/assets";
import { formatUSD } from "@/lib/format";
import type {
  BrandAction,
  BrandHub,
  BrandPresence,
  BrandResource,
  BrandAvailabilityItem,
  BrandLaunch,
  BrandUpcomingEvent,
  BrandSkuSignal,
} from "@/lib/api";
import { BrandUpcoming } from "@/components/brands/BrandUpcoming";
import { BrandHero, type HeroStat } from "@/components/brands/landing/BrandHero";
import { BrandSection, CountTag, SectionEmpty, SURFACE } from "@/components/brands/landing/Section";
import { StockMatrix } from "@/components/brands/landing/StockMatrix";
import { bestStatus, isAvailabilityList } from "@/lib/brand-stock";
import { SIGNAL_LIGHT_DOT, SIGNAL_LIGHT_LABELS } from "@/lib/brand-lights";
import { NEWS_KIND_LABELS, formatNewsDate } from "@/lib/news";
import { isVisualAsset } from "@/lib/brand-visuals";
import { scrollToBrandSection } from "@/lib/brand-html-nav";
import { ArrowUpRight, Check, Clock, FileText, Globe, GraduationCap, Mail, MessageSquare, Package, Phone } from "lucide-react";

function img(ref?: string | null) {
  return assetUrl(ref);
}

/** Productos de la landing: semáforo por distribuidor (nuevo), señales viejas o recorte público. */
type LandingProducts = BrandAvailabilityItem[] | BrandSkuSignal[] | PublicProduct[];

type ExtraBlock = { title?: string; body?: string; url?: string };

type PublicProduct = { name: string; imageUrl: string | null };
type PublicAction = { title: string; description: string | null; startsAt: string; endsAt: string };
type PublicNews = {
  id: string;
  publicKey?: string;
  title: string;
  excerpt?: string;
  kind?: string;
  coverUrl: string | null;
  publishedAt?: string | null;
};
type PublicFile = {
  title: string;
  description: string | null;
  type?: string | null;
  fileUrl?: string | null;
  contentUrl?: string | null;
  restricted?: boolean;
};
type Contact = { websiteUrl: string | null; supportEmail: string | null; supportPhone: string | null };

type SectionKey = "productos" | "lanzamientos" | "acciones" | "novedades" | "materiales" | "capacitaciones" | "contacto";

const SECTION_LABEL: Record<SectionKey, string> = {
  productos: "Semáforo de stock",
  lanzamientos: "Lanzamientos y eventos",
  acciones: "Promociones",
  novedades: "Novedades",
  materiales: "Materiales",
  capacitaciones: "Capacitaciones",
  contacto: "Contacto",
};

function hasContact(c: Contact) {
  return Boolean(c.supportEmail || c.supportPhone || c.websiteUrl);
}

export function BrandSpaceLanding({
  name,
  accent = "#22c55e",
  theme,
  contact,
  products = [],
  launches = [],
  events = [],
  actions = [],
  news = [],
  materials = [],
  trainings = [],
  html,
  presence,
  connectedAt,
  status,
  retailer = false,
  searchHref,
  chatHref,
  noticesHref,
  variant,
  extraBlocks = [],
  insights,
  heroCta,
}: {
  name: string;
  accent?: string;
  theme: {
    logoUrl: string | null;
    heroUrl: string | null;
    headline: string | null;
    about: string | null;
  };
  contact: Contact;
  products?: LandingProducts;
  launches?: BrandLaunch[];
  events?: BrandUpcomingEvent[];
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
  /** Bloque propio de quien mira (p. ej. sus compras de la marca), antes de los módulos. */
  insights?: ReactNode;
  /** Llamado dentro de la portada (p. ej. "Vincular con la marca" en el link público). */
  heroCta?: ReactNode;
}) {
  const hub = variant === "hub";
  const filled: Record<SectionKey, boolean> = {
    productos: products.length > 0,
    lanzamientos: launches.length > 0 || events.length > 0,
    acciones: actions.length > 0,
    novedades: news.length > 0,
    materiales: materials.length > 0,
    capacitaciones: trainings.length > 0,
    contacto: hasContact(contact),
  };
  // En el espacio vinculado se ven todos los módulos (los vacíos, como pendientes);
  // en el link público, solo los que tienen contenido.
  const visible = (Object.keys(SECTION_LABEL) as SectionKey[]).filter(
    (k) => filled[k] || (hub && k !== "lanzamientos")
  );
  const indexOf = (k: SectionKey) => visible.indexOf(k) + 1;

  const stats = heroStats(products, launches, events, actions);

  function onLandingClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href?.startsWith("#")) return;
    e.preventDefault();
    scrollToBrandSection(href);
  }

  return (
    <div className="bg-surface-950 text-white" onClick={onLandingClick}>
      <BrandHero
        name={name}
        accent={accent}
        logoUrl={theme.logoUrl}
        heroUrl={theme.heroUrl}
        headline={theme.headline}
        about={theme.about}
        connectedAt={connectedAt}
        badge={hub && presence ? <PresenceBadge presence={presence} /> : null}
        stats={stats}
        searchHref={retailer ? searchHref : undefined}
        chatHref={chatHref}
        noticesHref={noticesHref}
        cta={heroCta}
      />

      {status === "SUSPENDED" && (
        <p className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
          <span className="block rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/30">
            El vínculo está en pausa. Podés mirar la página, pero algunas operaciones pueden estar limitadas.
          </span>
        </p>
      )}

      {visible.length > 1 && (
        <nav aria-label="Secciones" className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-950/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
            {visible.map((k) => (
              <a
                key={k}
                href={`#${k}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  scrollToBrandSection(`#${k}`);
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-surface-300 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                {SECTION_LABEL[k]}
                {!filled[k] && hub && <Clock className="h-3.5 w-3.5 text-amber-300/80" aria-label="Pendiente" />}
              </a>
            ))}
          </div>
        </nav>
      )}

      {insights}

      {html ? (
        html
      ) : (
        <div className="pb-10">
          {visible.includes("productos") && (
            <ProductsSection
              name={name}
              products={products}
              retailer={retailer}
              searchHref={searchHref}
              hub={hub}
              ready={filled.productos}
              index={indexOf("productos")}
            />
          )}
          <BrandUpcoming name={name} launches={launches} events={events} index={indexOf("lanzamientos") || undefined} />
          {visible.includes("acciones") && (
            <ActionsSection name={name} actions={actions} hub={hub} ready={filled.acciones} index={indexOf("acciones")} />
          )}
          {visible.includes("novedades") && <NewsSection name={name} items={news} hub={hub} index={indexOf("novedades")} />}
          {visible.includes("materiales") && (
            <FilesSection
              id="materiales"
              title="Materiales"
              module="materials"
              items={materials}
              pendingText={`${name} todavía no subió fichas ni catálogos. Cuando lo haga, aparecen acá para bajarlos.`}
              hub={hub}
              index={indexOf("materiales")}
            />
          )}
          {visible.includes("capacitaciones") && (
            <FilesSection
              id="capacitaciones"
              title="Capacitaciones"
              module="trainings"
              items={trainings}
              pendingText={`${name} todavía no cargó cursos ni argumentarios.`}
              hub={hub}
              index={indexOf("capacitaciones")}
            />
          )}
          {extraBlocks.length > 0 && <ExtraBlocks blocks={extraBlocks} />}
          {visible.includes("contacto") && (
            <ContactSection
              name={name}
              contact={contact}
              chatHref={chatHref}
              hub={hub}
              ready={filled.contacto}
              index={indexOf("contacto")}
            />
          )}
        </div>
      )}
    </div>
  );
}

function heroStats(
  products: LandingProducts,
  launches: BrandLaunch[],
  events: BrandUpcomingEvent[],
  actions: unknown[]
): HeroStat[] {
  if (!isAvailabilityList(products)) return [];
  const inStock = products.filter((p) => ["LOW", "MEDIUM", "HIGH"].includes(bestStatus(p))).length;
  const third =
    launches.length > 0
      ? { value: launches.length, label: "Por llegar" }
      : events.length > 0
        ? { value: events.length, label: "Eventos" }
        : { value: actions.length, label: "Promociones" };
  return [
    { value: products.length, label: "Productos" },
    { value: inStock, label: "Con stock hoy" },
    third,
  ];
}

function PresenceBadge({ presence }: { presence: BrandPresence }) {
  return presence.pending ? (
    <span className="inline-flex items-center gap-1 text-amber-300">
      <Clock className="h-3.5 w-3.5" /> Pendiente de contenido
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-emerald-300">
      <Check className="h-3.5 w-3.5" /> Conectada
    </span>
  );
}

// ---------- Semáforo de stock ----------

export function ProductsSection({
  name,
  products,
  retailer,
  searchHref,
  hub,
  ready,
  index,
}: {
  name: string;
  products: LandingProducts;
  retailer: boolean;
  searchHref?: string;
  hub: boolean;
  ready: boolean;
  index?: number;
}) {
  const availability = isAvailabilityList(products);
  return (
    <BrandSection
      id="productos"
      index={index}
      title={availability ? "Semáforo de stock" : "Productos"}
      description={
        availability
          ? `Cuánto stock hay de cada producto de ${name} en cada distribuidor, y su precio de referencia.`
          : `Productos de ${name}.`
      }
      aside={ready ? <CountTag n={products.length} label="productos" /> : null}
    >
      {!ready ? (
        <SectionEmpty>
          {name} todavía no cargó su semáforo de stock.{" "}
          {retailer && searchHref && (
            <Link href={searchHref} className="font-medium text-brand-400 hover:text-brand-300">
              Buscar sus productos en tus distribuidores →
            </Link>
          )}
        </SectionEmpty>
      ) : availability ? (
        <StockMatrix items={products} audience={hub ? "client" : "public"} />
      ) : (
        <LegacyProducts products={products as Array<BrandSkuSignal | PublicProduct>} />
      )}
    </BrandSection>
  );
}

/** Señales viejas o recorte público sin semáforo: grilla simple de nombre e imagen. */
function LegacyProducts({ products }: { products: Array<BrandSkuSignal | PublicProduct> }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? products : products.slice(0, 12);
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((row, i) => {
          const signal = "light" in row ? row : null;
          return (
            <li key={signal?.id ?? `${row.name}-${i}`} className={`${SURFACE} overflow-hidden`}>
              <div className="aspect-square bg-white">
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(row.imageUrl)} alt={row.name} className="h-full w-full object-contain p-3" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-800">
                    <Package className="h-6 w-6 text-surface-500" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm text-white">{row.name}</p>
                {signal && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-surface-400">
                    <span className={`h-2 w-2 rounded-full ${SIGNAL_LIGHT_DOT[signal.light]}`} />
                    {SIGNAL_LIGHT_LABELS[signal.light]}
                    {signal.suggestedPrice != null ? ` · ${formatUSD(signal.suggestedPrice)}` : ""}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {products.length > 12 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 text-sm font-medium text-brand-400 hover:text-brand-300"
        >
          {showAll ? "Ver menos" : `Ver los ${products.length} productos`}
        </button>
      )}
    </>
  );
}

// ---------- Promociones ----------

export function ActionsSection({
  name,
  actions,
  hub,
  ready,
  index,
}: {
  name: string;
  actions: BrandAction[] | PublicAction[];
  hub: boolean;
  ready: boolean;
  index?: number;
}) {
  return (
    <BrandSection
      id="acciones"
      index={index}
      title="Promociones"
      description={
        hub
          ? `Objetivos de compra y rebates de ${name}. Tu avance se mide con tus pedidos por NODO.`
          : `Promociones vigentes de ${name}.`
      }
      aside={ready ? <CountTag n={actions.length} label="vigentes" /> : null}
    >
      {!ready ? (
        <SectionEmpty>{name} no tiene promociones vigentes. Cuando lance una, tu avance se mide acá.</SectionEmpty>
      ) : (
        <ul className={`${SURFACE} divide-y divide-white/[0.06]`}>
          {actions.map((action, i) => (
            <ActionRow key={"id" in action ? action.id : `${action.title}-${i}`} action={action} />
          ))}
        </ul>
      )}
    </BrandSection>
  );
}

function ActionRow({ action }: { action: BrandAction | PublicAction }) {
  const ends = new Date(action.endsAt).toLocaleDateString("es-AR", { day: "numeric", month: "long" });
  const progress = "progress" in action ? action : null;
  const amount = progress?.kind === "PURCHASE_AMOUNT";
  const fmt = (n: number) => (amount ? formatUSD(n) : `${n} u.`);
  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_16rem] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{action.title}</p>
        {action.description && <p className="mt-1 max-w-2xl text-sm text-surface-400">{action.description}</p>}
        <p className="mt-1.5 text-xs text-surface-500">Vigente hasta el {ends}</p>
      </div>
      {progress && (
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-surface-400">Tu avance</span>
            <span className="tabular-nums text-white">
              {fmt(progress.progress.current)}
              {progress.progress.target != null ? ` / ${fmt(progress.progress.target)}` : ""}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full ${progress.progress.met ? "bg-emerald-400" : "bg-brand-500"}`}
              style={{ width: `${Math.round(Math.min(1, progress.progress.ratio) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

// ---------- Novedades ----------

export function NewsSection({
  name,
  items,
  hub,
  index,
}: {
  name: string;
  items: BrandHub["news"] | PublicNews[];
  hub: boolean;
  index?: number;
}) {
  const ready = items.length > 0;
  return (
    <BrandSection
      id="novedades"
      index={index}
      title="Novedades"
      description={`Lo que publica ${name}: lanzamientos, eventos y avisos.`}
      aside={ready ? <CountTag n={items.length} label={items.length === 1 ? "nota" : "notas"} /> : null}
    >
      {!ready ? (
        <SectionEmpty>{name} todavía no publicó novedades.</SectionEmpty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} hub={hub} />
          ))}
        </ul>
      )}
    </BrandSection>
  );
}

function newsHref(item: PublicNews, hub: boolean) {
  if (hub) return `/noticias/${item.id}`;
  if (item.publicKey) return `/n/${item.publicKey}`;
  return null;
}

function NewsCard({ item, hub }: { item: PublicNews; hub: boolean }) {
  const href = newsHref(item, hub);
  const kind = item.kind && item.kind in NEWS_KIND_LABELS ? NEWS_KIND_LABELS[item.kind as keyof typeof NEWS_KIND_LABELS] : null;
  const body = (
    <article className={`${SURFACE} group flex h-full flex-col overflow-hidden transition-colors hover:ring-white/15`}>
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-800">
        {item.coverUrl ? (
          <>
            {/* Fondo desenfocado + imagen entera: las fotos de producto no se estiran ni se pixelan. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img(item.coverUrl)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img(item.coverUrl)} alt={item.title} className="relative h-full w-full object-contain p-3" />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText className="h-7 w-7 text-surface-600" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-surface-500">
          {kind}
          {kind && item.publishedAt ? " · " : ""}
          {item.publishedAt ? formatNewsDate(item.publishedAt) : ""}
        </p>
        <h3 className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug text-white">{item.title}</h3>
        {item.excerpt && <p className="mt-1.5 line-clamp-2 text-sm text-surface-400">{item.excerpt}</p>}
        {href && (
          <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-brand-400 group-hover:text-brand-300">
            Leer <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </article>
  );
  return <li>{href ? <Link href={href} className="block h-full">{body}</Link> : body}</li>;
}

// ---------- Materiales y capacitaciones ----------

export function FilesSection({
  id,
  title,
  module,
  items,
  pendingText,
  hub,
  index,
}: {
  id: string;
  title: string;
  module: "materials" | "trainings";
  items: BrandResource[] | PublicFile[];
  pendingText: string;
  hub: boolean;
  index?: number;
}) {
  const Icon = module === "trainings" ? GraduationCap : FileText;
  return (
    <BrandSection
      id={id}
      index={index}
      title={title}
      description={
        module === "trainings"
          ? "Cursos, videos y argumentarios para vender mejor."
          : "Fichas, catálogos y piezas de venta para descargar."
      }
      aside={items.length > 0 ? <CountTag n={items.length} label={items.length === 1 ? "archivo" : "archivos"} /> : null}
    >
      {items.length === 0 ? (
        <SectionEmpty>{pendingText}</SectionEmpty>
      ) : (
        <ul className={`${SURFACE} divide-y divide-white/[0.06]`}>
          {items.map((item, i) => {
            const res = "id" in item && "kind" in item ? (item as BrandResource) : null;
            const file = item as PublicFile;
            const url = res ? res.fileUrl || res.contentUrl : file.fileUrl || file.contentUrl || null;
            const fileRef = res ? res.fileUrl : file.fileUrl;
            const href = url ? (fileRef ? img(fileRef) : url) : null;
            const visual = url && isVisualAsset(res?.type ?? file.type ?? "", url) ? img(url) : null;
            const inner = (
              <>
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/10">
                  {visual ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={visual} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-5 w-5 text-surface-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{item.title}</p>
                  {item.description && <p className="mt-0.5 line-clamp-1 text-sm text-surface-400">{item.description}</p>}
                </div>
                {href ? (
                  <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-surface-500 transition-colors group-hover:text-white" />
                ) : (
                  !hub && <span className="flex-shrink-0 text-xs text-surface-500">Solo para comercios vinculados</span>
                )}
              </>
            );
            const cls = "group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03]";
            return (
              <li key={res?.id ?? `${item.title}-${i}`}>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className={cls}>
                    {inner}
                  </a>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </BrandSection>
  );
}

function ExtraBlocks({ blocks }: { blocks: ExtraBlock[] }) {
  return (
    <section className="border-t border-white/[0.06] py-10">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 sm:px-6">
        {blocks.map((block, i) => (
          <article key={i} className={`${SURFACE} p-5`}>
            {block.title && <h2 className="text-base font-semibold text-white">{block.title}</h2>}
            {block.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-surface-300">{block.body}</p>}
            {block.url && (
              <a href={block.url} className="mt-3 inline-flex items-center gap-1 text-sm text-brand-400" target="_blank" rel="noreferrer">
                <Globe className="h-3.5 w-3.5" /> Más info
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- Contacto ----------

export function ContactSection({
  name,
  contact,
  chatHref,
  hub,
  ready,
  index,
}: {
  name: string;
  contact: Contact;
  chatHref?: string;
  hub: boolean;
  ready: boolean;
  index?: number;
}) {
  const item = "inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2.5 text-sm text-white ring-1 ring-white/10 transition-colors hover:bg-white/10";
  return (
    <BrandSection id="contacto" index={index} title="Contacto" description={`Cómo hablar con ${name}.`}>
      {!ready && !chatHref ? (
        <SectionEmpty>{name} no publicó mail, teléfono ni web.</SectionEmpty>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hub && chatHref && (
            <Link href={chatHref} className={item}>
              <MessageSquare className="h-4 w-4 text-surface-300" /> Chat en NODO
            </Link>
          )}
          {contact.supportEmail && (
            <a href={`mailto:${contact.supportEmail}`} className={item}>
              <Mail className="h-4 w-4 text-surface-300" /> {contact.supportEmail}
            </a>
          )}
          {contact.supportPhone && (
            <a href={`tel:${contact.supportPhone}`} className={item}>
              <Phone className="h-4 w-4 text-surface-300" /> {contact.supportPhone}
            </a>
          )}
          {contact.websiteUrl && (
            <a href={contact.websiteUrl} target="_blank" rel="noreferrer" className={item}>
              <Globe className="h-4 w-4 text-surface-300" /> {contact.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
      )}
    </BrandSection>
  );
}

/** Módulos que se pintan adentro de la landing (huecos del HTML o cuerpo nativo). */
export function landingModuleSlots({
  name,
  products,
  launches = [],
  events = [],
  actions,
  news,
  materials,
  trainings,
  contact,
  retailer = false,
  searchHref,
  chatHref,
  hub,
  presence,
  logoUrl,
}: {
  name: string;
  products: LandingProducts;
  launches?: BrandLaunch[];
  events?: BrandUpcomingEvent[];
  actions: BrandAction[] | PublicAction[];
  news: BrandHub["news"] | PublicNews[];
  materials: BrandResource[] | PublicFile[];
  trainings: BrandResource[] | PublicFile[];
  contact: Contact;
  retailer?: boolean;
  searchHref?: string;
  chatHref?: string;
  hub: boolean;
  presence?: BrandPresence;
  logoUrl?: string | null;
}) {
  const productsReady = presence?.modules.products.ready ?? products.length > 0;
  const actionsReady = presence?.modules.actions.ready ?? actions.length > 0;
  const contactReady = presence?.modules.contact.ready ?? hasContact(contact);
  const productsSection = (
    <ProductsSection name={name} products={products} retailer={retailer} searchHref={searchHref} hub={hub} ready={productsReady} />
  );
  return {
    productos: productsSection,
    semaforos: productsSection,
    lanzamientos: <BrandUpcoming name={name} launches={launches} events={events} />,
    acciones: <ActionsSection name={name} actions={actions} hub={hub} ready={actionsReady} />,
    materiales: (
      <FilesSection
        id="materiales"
        title="Materiales"
        module="materials"
        items={materials}
        pendingText={`${name} todavía no subió fichas ni catálogos.`}
        hub={hub}
      />
    ),
    capacitaciones: (
      <FilesSection
        id="capacitaciones"
        title="Capacitaciones"
        module="trainings"
        items={trainings}
        pendingText={`${name} todavía no cargó cursos ni argumentarios.`}
        hub={hub}
      />
    ),
    novedades: <NewsSection name={name} items={news} hub={hub} />,
    noticias: <NewsSection name={name} items={news} hub={hub} />,
    contacto: <ContactSection name={name} contact={contact} chatHref={chatHref} hub={hub} ready={contactReady} />,
    hablar: chatHref ? (
      <Link href={chatHref} className="text-sm underline text-white">
        Hablar con {name}
      </Link>
    ) : (
      <ContactSection name={name} contact={contact} hub={hub} ready={contactReady} />
    ),
    nombre: <span>{name}</span>,
    logo: logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img(logoUrl)} alt={name} style={{ height: 48 }} />
    ) : null,
  };
}

export function brandHubSlotModules({ hub, retailer = false }: { hub: BrandHub; retailer?: boolean }) {
  return landingModuleSlots({
    name: hub.name,
    products: hub.availability,
    launches: hub.launches ?? [],
    events: hub.events ?? [],
    actions: hub.actions,
    news: hub.news ?? [],
    materials: hub.materials,
    trainings: hub.trainings,
    contact: hub.contact,
    retailer,
    searchHref: `/search?marca=${encodeURIComponent(hub.name)}`,
    chatHref: `/mensajes?linkId=${hub.linkId}`,
    hub: true,
    presence: hub.presence,
    logoUrl: hub.theme.logoUrl,
  });
}
