import {
  CATALOG_API_SCOPES,
  resolveApiClientConfig,
  type ApiClientConfig,
  type CatalogApiScope,
} from "@nodo/shared";
import { isValidAllowlistEntry } from "../auth/ip-allowlist";

/**
 * Validación de lo que manda la pantalla (o un integrador) al crear o editar
 * una key. Devuelve la config completa o la lista de problemas, en criollo.
 */

const ROUNDINGS = ["none", "0.01", "1", "10", "99"];
const FX = ["oficial", "blue", "mep", "tarjeta", "fixed"];
const TEMPLATE_VARS = /\{(id|sku|ean|partNumber|slug)\}/;

export const MAX_IP_ENTRIES = 50;
export const DEFAULT_SCOPES: CatalogApiScope[] = ["catalog:read", "changes:read", "export:read", "feeds:read"];

export class ConfigInputError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Mezcla lo que llega sobre la config actual (o los defaults) y valida. */
export function parseConfigInput(raw: unknown, current: unknown, validProviders: readonly string[]): ApiClientConfig {
  if (raw === undefined) return resolveApiClientConfig(current);
  if (!isObj(raw)) throw new ConfigInputError(["La configuración tiene que ser un objeto."]);
  const base = resolveApiClientConfig(current);
  const problems: string[] = [];
  const merged: ApiClientConfig = {
    ...base,
    ...(raw.defaultView !== undefined ? { defaultView: raw.defaultView as ApiClientConfig["defaultView"] } : {}),
    ...(raw.providerIdentity !== undefined ? { providerIdentity: raw.providerIdentity as ApiClientConfig["providerIdentity"] } : {}),
    ...(raw.includeOutOfStock !== undefined ? { includeOutOfStock: raw.includeOutOfStock as boolean } : {}),
    ...(raw.minStock !== undefined ? { minStock: raw.minStock as number } : {}),
    providers: isObj(raw.providers) ? { ...base.providers, ...(raw.providers as object) } as ApiClientConfig["providers"] : base.providers,
    price: isObj(raw.price)
      ? ({
          ...base.price,
          ...(raw.price as object),
          markup: isObj((raw.price as Record<string, unknown>).markup)
            ? { ...base.price.markup, ...((raw.price as Record<string, unknown>).markup as object) }
            : base.price.markup,
        } as ApiClientConfig["price"])
      : base.price,
    fields: isObj(raw.fields) ? ({ ...base.fields, ...(raw.fields as object) } as ApiClientConfig["fields"]) : base.fields,
    feed: isObj(raw.feed) ? ({ ...base.feed, ...(raw.feed as object) } as ApiClientConfig["feed"]) : base.feed,
  };

  if (!["products", "offers"].includes(merged.defaultView)) problems.push("La vista por defecto es «products» u «offers».");
  if (!["hidden", "visible"].includes(merged.providerIdentity)) problems.push("La identidad del distribuidor es «hidden» o «visible».");
  if (typeof merged.includeOutOfStock !== "boolean") problems.push("«includeOutOfStock» es verdadero o falso.");
  if (!Number.isInteger(merged.minStock) || merged.minStock < 0 || merged.minStock > 100_000) problems.push("El stock mínimo es un entero entre 0 y 100.000.");

  if (!["all", "only"].includes(merged.providers.mode)) problems.push("Los distribuidores son «all» u «only».");
  if (!Array.isArray(merged.providers.keys) || merged.providers.keys.some((k) => typeof k !== "string")) {
    problems.push("La lista de distribuidores tiene que ser de textos.");
  } else {
    const unknown = merged.providers.keys.filter((k) => !validProviders.includes(k));
    if (unknown.length) problems.push(`Distribuidores que no tenés conectados: ${unknown.join(", ")}.`);
    if (merged.providers.mode === "only" && merged.providers.keys.length === 0) problems.push("Elegí al menos un distribuidor.");
    merged.providers.keys = [...new Set(merged.providers.keys)];
  }

  const p = merged.price;
  for (const flag of ["includeCost", "includeTaxes", "includeSalePrice"] as const) {
    if (typeof p[flag] !== "boolean") problems.push(`«price.${flag}» es verdadero o falso.`);
  }
  if (!p.includeCost && !p.includeSalePrice) problems.push("Elegí exponer el costo, el precio de venta o los dos.");
  if (!["provider", "fixed"].includes(p.markup.mode)) problems.push("El margen es «provider» (el de NODO) o «fixed».");
  if (p.markup.mode === "fixed") {
    const n = Number(p.markup.percent);
    if (!Number.isFinite(n) || n < -90 || n > 1000) problems.push("El margen fijo va de -90% a 1000%.");
    else p.markup.percent = Math.round(n * 100) / 100;
  } else {
    delete p.markup.percent;
  }
  if (!ROUNDINGS.includes(p.rounding)) problems.push(`El redondeo es uno de: ${ROUNDINGS.join(", ")}.`);
  if (!["USD", "ARS"].includes(p.currency)) problems.push("La moneda es USD o ARS.");
  if (!FX.includes(p.fxRate)) problems.push(`La cotización es una de: ${FX.join(", ")}.`);
  if (p.fxRate === "fixed") {
    const n = Number(p.fxFixed);
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) problems.push("La cotización fija tiene que ser un número mayor a 0.");
    else p.fxFixed = n;
  } else {
    delete p.fxFixed;
  }

  if (typeof merged.fields.raw !== "boolean" || typeof merged.fields.priceHistory !== "boolean") {
    problems.push("«fields.raw» y «fields.priceHistory» son verdadero o falso.");
  }
  const template = merged.feed.productUrlTemplate;
  if (template != null && template !== "") {
    if (typeof template !== "string" || template.length > 500) problems.push("El link de producto es un texto de hasta 500 caracteres.");
    else if (!/^https:\/\//.test(template)) problems.push("El link de producto empieza con https://.");
    else if (!TEMPLATE_VARS.test(template)) problems.push("El link de producto tiene que usar {id}, {sku}, {ean}, {partNumber} o {slug}.");
  } else {
    delete merged.feed.productUrlTemplate;
  }

  if (problems.length) throw new ConfigInputError(problems);
  return merged;
}

export function parseScopes(raw: unknown): CatalogApiScope[] {
  if (raw === undefined) return DEFAULT_SCOPES;
  if (!Array.isArray(raw) || raw.length === 0) throw new ConfigInputError(["Elegí al menos un permiso."]);
  const valid = new Set<string>(CATALOG_API_SCOPES);
  const bad = raw.filter((s) => !valid.has(String(s)));
  if (bad.length) throw new ConfigInputError([`Permisos desconocidos: ${bad.join(", ")}.`]);
  return [...new Set(raw.map(String))] as CatalogApiScope[];
}

export function parseIpAllowlist(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ConfigInputError(["La lista de IPs tiene que ser una lista."]);
  const entries = [...new Set(raw.map((e) => String(e).trim()).filter(Boolean))];
  if (entries.length > MAX_IP_ENTRIES) throw new ConfigInputError([`Hasta ${MAX_IP_ENTRIES} IPs o rangos por key.`]);
  const bad = entries.filter((e) => !isValidAllowlistEntry(e));
  if (bad.length) throw new ConfigInputError([`IPs o rangos inválidos: ${bad.join(", ")}.`]);
  return entries;
}
