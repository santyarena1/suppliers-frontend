import { Injectable } from "@nestjs/common";
import { Readable } from "stream";
import * as XLSX from "xlsx";
import type { CatalogApiView } from "@nodo/shared";
import type { ApiPrincipal } from "../auth/api-principal";
import { Errors } from "../core/api-error";
import { CatalogQueryService } from "../core/catalog-query.service";
import { offerView, productView } from "../core/projection";
import { csvLine, OFFER_COLUMNS, offerRecord, PRODUCT_COLUMNS, productRecord } from "./export-format";
import { feedItem, GOOGLE_FEED_FOOTER, googleFeedHeader, googleFeedItem, META_COLUMNS, metaFeedLine } from "./feed-format";

export const XLSX_MAX_ROWS = 100_000;
export type ExportFormat = "csv" | "json" | "xlsx";

export interface ExportFile {
  contentType: string;
  filename: string;
  body: Readable | Buffer;
}

/**
 * Catálogo completo con la config de la key, para quien no programa contra la
 * API (planilla, importador de una tienda) y para arrancar una sincronización
 * (export completo + /v1/changes desde ese momento).
 */
@Injectable()
export class ExportService {
  constructor(private readonly catalog: CatalogQueryService) {}

  async export(principal: ApiPrincipal, format: ExportFormat, view: CatalogApiView, delimiter: "," | ";"): Promise<ExportFile> {
    const { view: keyView, groups, meta } = await this.catalog.allForKey(principal);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `nodo-catalogo-${view}-${stamp}`;
    const records =
      view === "products"
        ? groups().map((g) => productView(g, keyView.ctx))
        : keyView.rows.map((r) => offerView(r.row, keyView.ctx, true));

    if (format === "json") {
      return { contentType: "application/json; charset=utf-8", filename: `${base}.json`, body: Readable.from(jsonChunks(meta, records)) };
    }
    const columns = view === "products" ? PRODUCT_COLUMNS : OFFER_COLUMNS;
    const toRecord = (r: unknown) =>
      view === "products" ? productRecord(r as ReturnType<typeof productView>) : offerRecord(r as ReturnType<typeof offerView>);
    if (format === "xlsx") {
      if (records.length > XLSX_MAX_ROWS) {
        throw Errors.invalidParameter(`El export XLSX admite hasta ${XLSX_MAX_ROWS} filas. Usá CSV o JSON.`);
      }
      const sheet = XLSX.utils.json_to_sheet(records.map(toRecord), { header: [...columns] });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, view === "products" ? "Productos" : "Ofertas");
      const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${base}.xlsx`,
        body: buffer,
      };
    }
    return {
      contentType: "text/csv; charset=utf-8",
      filename: `${base}.csv`,
      body: Readable.from(csvChunks(columns, records.map(toRecord), delimiter)),
    };
  }

  async googleFeed(principal: ApiPrincipal): Promise<ExportFile> {
    const items = await this.feedItems(principal);
    const link = principal.config.feed.productUrlTemplate!.split("{")[0] || "https://nodohub.app";
    return {
      contentType: "application/xml; charset=utf-8",
      filename: "google-merchant.xml",
      body: Readable.from(
        (function* () {
          yield googleFeedHeader(principal.tenantName, link);
          for (const item of items) yield googleFeedItem(item);
          yield GOOGLE_FEED_FOOTER;
        })()
      ),
    };
  }

  async metaFeed(principal: ApiPrincipal): Promise<ExportFile> {
    const items = await this.feedItems(principal);
    return {
      contentType: "text/csv; charset=utf-8",
      filename: "meta-catalog.csv",
      body: Readable.from(
        (function* () {
          yield csvLine(META_COLUMNS, ",");
          for (const item of items) yield metaFeedLine(item);
        })()
      ),
    };
  }

  private async feedItems(principal: ApiPrincipal) {
    const template = principal.config.feed.productUrlTemplate?.trim();
    if (!template) throw Errors.feedLinkRequired();
    const { view, groups } = await this.catalog.allForKey(principal);
    return groups()
      .map((g) => feedItem(productView(g, view.ctx), template))
      .filter((item): item is NonNullable<typeof item> => item != null);
  }
}

function* csvChunks(columns: readonly string[], rows: Record<string, unknown>[], delimiter: string) {
  // BOM: Excel abre el UTF-8 con tildes bien.
  yield "﻿" + csvLine([...columns], delimiter);
  let chunk = "";
  for (const row of rows) {
    chunk += csvLine(columns.map((c) => row[c] as string | number | boolean | null), delimiter);
    if (chunk.length > 64_000) {
      yield chunk;
      chunk = "";
    }
  }
  if (chunk) yield chunk;
}

function* jsonChunks(meta: unknown, records: unknown[]) {
  yield `{"meta":${JSON.stringify(meta)},"count":${records.length},"data":[`;
  for (let i = 0; i < records.length; i++) yield (i ? "," : "") + JSON.stringify(records[i]);
  yield "]}";
}
