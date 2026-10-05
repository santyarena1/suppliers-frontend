import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { ApiClientConfig } from "@nodo/shared";
import { searchTokens, scoreCatalogMatch } from "../../providers/catalog-search";
import type { ApiPrincipal } from "../auth/api-principal";
import type { ListQueryDto, ListSort } from "../v1/dto/list-query.dto";
import { Errors } from "./api-error";
import type { CatalogRow, CatalogSnapshot } from "./catalog-row";
import { CatalogSnapshotService } from "./catalog-snapshot.service";
import { compareSortKeys, decodePageCursor, encodeCursor, pageAfter, type PageCursor } from "./cursor";
import { FxService, type FxForKey } from "./fx.service";
import { cleanGtin, foldLabel, slugId } from "./ids";
import {
  groupRows,
  offerView,
  productView,
  rowVisibleForKey,
  sortablePrice,
  type OfferView,
  type ProductGroup,
  type ProductView,
  type ProjectionContext,
} from "./projection";
import { makeConverter } from "./pricing";

const DEFAULT_LIMIT = 100;
const VIEW_TTL_MS = 60_000;

export interface ListMeta {
  currency: string;
  fx: FxForKey;
  generatedAt: string;
  /** Cuándo se armó la foto del catálogo que se está paginando. */
  catalogAt: string;
}

export interface Page<T> {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
  meta: ListMeta;
}

/** Ofertas visibles para una key, con su precio comparable ya calculado. */
interface KeyView {
  at: number;
  builtAt: number;
  ctx: ProjectionContext;
  fx: FxForKey;
  rows: { row: CatalogRow; price: number | null }[];
  groups: ProductGroup[] | null;
  /** Índices para buscar una oferta o un producto sin recorrer todo. */
  byOfferId: Map<string, CatalogRow> | null;
  byProviderKey: Map<string, CatalogRow> | null;
}

type Entry = { row: CatalogRow; price: number | null } | ProductGroup;

/**
 * Listados y detalles de /v1. Trabaja sobre la foto del catálogo del comercio
 * y aplica la config de cada key; lo que cuesta (precio, agrupación) se calcula
 * una vez por key y por foto.
 */
@Injectable()
export class CatalogQueryService {
  private readonly views = new Map<string, KeyView>();

  constructor(
    private readonly snapshots: CatalogSnapshotService,
    private readonly fx: FxService
  ) {}

  async listOffers(principal: ApiPrincipal, query: ListQueryDto): Promise<Page<OfferView>> {
    const view = await this.view(principal);
    const entries = this.filter(view.rows, query, view);
    const page = this.paginate(entries, query, "offers");
    return {
      data: page.items.map((e) => offerView((e as { row: CatalogRow }).row, view.ctx, true)),
      pagination: page.pagination,
      meta: this.meta(view),
    };
  }

  async listProducts(principal: ApiPrincipal, query: ListQueryDto): Promise<Page<ProductView>> {
    const view = await this.view(principal);
    const groups = this.groups(view);
    const entries = this.filter(groups, query, view);
    const page = this.paginate(entries, query, "products");
    return {
      data: page.items.map((g) => productView(g as ProductGroup, view.ctx)),
      pagination: page.pagination,
      meta: this.meta(view),
    };
  }

  async getOffer(principal: ApiPrincipal, offerId: string): Promise<{ data: OfferView; meta: ListMeta; row: CatalogRow }> {
    const view = await this.view(principal);
    const row = this.index(view).byOfferId.get(offerId);
    if (!row) throw Errors.notFound("La oferta");
    return { data: offerView(row, view.ctx, true), meta: this.meta(view), row };
  }

  async getProduct(principal: ApiPrincipal, productId: string): Promise<{ data: ProductView; meta: ListMeta }> {
    const view = await this.view(principal);
    const group = this.groups(view).find((g) => g.productId === productId);
    if (!group) throw Errors.notFound("El producto");
    return { data: productView(group, view.ctx), meta: this.meta(view) };
  }

  /** Para el feed de cambios y los webhooks: la oferta tal como la ve la key, o `null` si no la ve. */
  async offerForKey(principal: ApiPrincipal, provider: string, externalId: string): Promise<OfferView | null> {
    const view = await this.view(principal);
    const row = this.index(view).byProviderKey.get(`${provider}:${externalId}`);
    return row ? offerView(row, view.ctx, true) : null;
  }

  /** Todas las filas visibles para la key (export y feeds). */
  async allForKey(principal: ApiPrincipal) {
    const view = await this.view(principal);
    return { view, groups: () => this.groups(view), meta: this.meta(view) };
  }

  async snapshotFor(principal: ApiPrincipal): Promise<CatalogSnapshot> {
    return this.snapshots.get(principal.catalogTenantId);
  }

  async fxFor(config: ApiClientConfig): Promise<FxForKey> {
    return this.fx.forKey(config.price.fxRate, config.price.fxFixed);
  }

  // ---------- internos ----------

  private async view(principal: ApiPrincipal): Promise<KeyView> {
    const snapshot = await this.snapshots.get(principal.catalogTenantId);
    const config = principal.config;
    const key = `${principal.clientId}:${hashConfig(config)}`;
    const cached = this.views.get(key);
    if (cached && cached.builtAt === snapshot.builtAt.getTime() && Date.now() - cached.at < VIEW_TTL_MS) return cached;

    const fx = await this.fxFor(config);
    const visible = snapshot.rows.filter((row) => rowVisibleForKey(row, config));
    const needsFx = visible.some((row) => row.currency !== config.price.currency);
    if (needsFx && !fx.rate) throw Errors.fxUnavailable();
    const ctx: ProjectionContext = {
      config,
      providers: snapshot.providers,
      convert: makeConverter(config.price.currency, fx.rate),
    };
    const view: KeyView = {
      at: Date.now(),
      builtAt: snapshot.builtAt.getTime(),
      ctx,
      fx,
      rows: visible.map((row) => ({ row, price: sortablePrice(row, ctx) })),
      groups: null,
      byOfferId: null,
      byProviderKey: null,
    };
    if (this.views.size > 200) this.views.clear();
    this.views.set(key, view);
    return view;
  }

  private index(view: KeyView) {
    view.byOfferId ??= new Map(view.rows.map((r) => [r.row.offerId, r.row]));
    view.byProviderKey ??= new Map(view.rows.map((r) => [`${r.row.provider}:${r.row.externalId}`, r.row]));
    return { byOfferId: view.byOfferId, byProviderKey: view.byProviderKey };
  }

  private groups(view: KeyView): ProductGroup[] {
    view.groups ??= groupRows(
      view.rows.map((r) => r.row),
      view.ctx
    );
    return view.groups;
  }

  private filter<T extends Entry>(entries: T[], query: ListQueryDto, view: KeyView): T[] {
    const tokens = searchTokens(query.q ?? "");
    const brand = query.brand ? foldLabel(query.brand) : null;
    const category = query.category ? foldLabel(query.category) : null;
    const subcategory = query.subcategory ? foldLabel(query.subcategory) : null;
    const provider = query.provider?.trim() || null;
    const ean = query.ean ? cleanGtin(query.ean) ?? query.ean.replace(/\D/g, "") : null;
    const pn = query.partNumber ? normPn(query.partNumber) : null;
    const since = query.updatedSince ? new Date(query.updatedSince) : null;

    const rowsOf = (e: Entry) => ("lead" in e ? e.rows.map((x) => x.row) : [e.row]);
    const priceOf = (e: Entry) => ("lead" in e ? e.minPrice : e.price);
    const matchLabel = (value: string | null, wanted: string, prefix: "brd" | "cat") =>
      Boolean(value) && (foldLabel(value!) === wanted || (wanted.startsWith(`${prefix}_`) && slugMatches(prefix, value!, wanted)));

    return entries.filter((e) => {
      const rows = rowsOf(e);
      const lead = "lead" in e ? e.lead : e.row;
      if (tokens.length && !tokens.every((t) => ("lead" in e ? e.searchText : lead.searchText).includes(t))) return false;
      if (brand && !rows.some((r) => matchLabel(r.brand, brand, "brd"))) return false;
      if (category && !rows.some((r) => matchLabel(r.category, category, "cat"))) return false;
      if (subcategory && !rows.some((r) => matchLabel(r.subcategory, subcategory, "cat") || slugMatches("cat", `${r.category}>${r.subcategory}`, subcategory))) return false;
      if (provider && !rows.some((r) => providerMatches(r, provider, view))) return false;
      if (query.inStock === true && !rows.some((r) => r.stock == null || r.stock > 0)) return false;
      if (query.inStock === false && !rows.every((r) => r.stock === 0)) return false;
      const price = priceOf(e);
      if (query.minPrice != null && (price == null || price < query.minPrice)) return false;
      if (query.maxPrice != null && (price == null || price > query.maxPrice)) return false;
      if (since && !rows.some((r) => r.updatedAt >= since)) return false;
      if (ean && !rows.some((r) => (cleanGtin(r.ean) ?? r.ean?.replace(/\D/g, "")) === ean)) return false;
      if (pn && !rows.some((r) => r.partNumber && normPn(r.partNumber) === pn)) return false;
      return true;
    });
  }

  private paginate<T extends Entry>(
    entries: T[],
    query: ListQueryDto,
    scope: string
  ): { items: T[]; pagination: Page<unknown>["pagination"] } {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const sort: ListSort = query.sort ?? (query.q ? "relevance" : "name");
    const desc = sort.startsWith("-") || sort === "relevance";
    const tokens = searchTokens(query.q ?? "");
    const keyOf = (e: Entry): { value: string | number | null; id: string } => {
      const lead = "lead" in e ? e.lead : e.row;
      const id = "lead" in e ? e.productId : e.row.offerId;
      switch (sort.replace(/^-/, "")) {
        case "price":
          return { value: "lead" in e ? e.minPrice : e.price, id };
        case "updatedAt":
          return { value: ("lead" in e ? e.updatedAt : e.row.updatedAt).getTime(), id };
        case "relevance":
          return { value: scoreCatalogMatch({ name: foldLabel(lead.name), brand: lead.brand }, foldLabel(query.q ?? ""), tokens), id };
        default:
          return { value: foldLabel(lead.name), id };
      }
    };
    const keyed = entries.map((e) => ({ e, k: keyOf(e) }));
    keyed.sort((a, b) => compareSortKeys(a.k.value, a.k.id, b.k.value, b.k.id, desc));
    const filterHash = hashQuery(query, scope);
    let cursor: PageCursor | null = null;
    if (query.cursor) {
      try {
        cursor = decodePageCursor(query.cursor, sort, filterHash);
      } catch (err) {
        throw Errors.invalidCursor((err as Error).message);
      }
    }
    const page = pageAfter(keyed, (x) => x.k, desc, cursor, limit);
    const last = page.items[page.items.length - 1];
    return {
      items: page.items.map((x) => x.e),
      pagination: {
        nextCursor: page.hasMore && last ? encodeCursor({ sort, filter: filterHash, value: last.k.value, id: last.k.id }) : null,
        hasMore: page.hasMore,
        limit,
      },
    };
  }

  private meta(view: KeyView): ListMeta {
    return {
      currency: view.ctx.config.price.currency,
      fx: view.fx,
      generatedAt: new Date().toISOString(),
      catalogAt: new Date(view.builtAt).toISOString(),
    };
  }
}

function normPn(value: string): string {
  return value.toUpperCase().replace(/[\s\-_./]/g, "");
}

function slugMatches(prefix: "brd" | "cat", label: string, wanted: string): boolean {
  return slugId(prefix, label) === wanted;
}

function providerMatches(row: CatalogRow, wanted: string, view: KeyView): boolean {
  const info = view.ctx.providers.get(row.provider);
  if (info?.aliasId === wanted) return true;
  return view.ctx.config.providerIdentity === "visible" && row.provider.toLowerCase() === wanted.toLowerCase();
}

export function hashConfig(config: ApiClientConfig): string {
  return createHash("sha1").update(JSON.stringify(config)).digest("hex").slice(0, 16);
}

function hashQuery(query: ListQueryDto, scope: string): string {
  const { cursor: _c, limit: _l, sort: _s, ...filters } = query;
  const stable = Object.keys(filters)
    .sort()
    .map((k) => `${k}=${String((filters as Record<string, unknown>)[k] ?? "")}`)
    .join("&");
  return createHash("sha1").update(`${scope}?${stable}`).digest("hex").slice(0, 12);
}
