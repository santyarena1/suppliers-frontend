import { emptyResult, LookupQuery, ManufacturerConnector, SourceFetcher, SourceResult } from "../types";

const SUGGEST = "https://psref.lenovo.com/api/search/DefinitionFilterAndSearch/Suggest";

interface PsrefItem {
  ProductName?: string;
  MachineType?: string;
  MarketingName?: string;
  ClassificationName?: string;
  SearchResultType?: string;
  info?: { photo?: string; page?: string; datasheet?: string };
}

/**
 * Las notebooks y PCs Lenovo usan part number MTM: 4 caracteres de tipo de
 * máquina + 6 de modelo (83K1003WAR). PSREF identifica el tipo de máquina.
 */
export function lenovoMachineType(pnKey: string | null): string | null {
  if (!pnKey || !/^[0-9A-Z]{10}$/.test(pnKey)) return null;
  const mt = pnKey.slice(0, 4);
  return /\d/.test(mt) ? mt : null;
}

export function parsePsref(body: unknown, machineType: string): PsrefItem | null {
  const data = (body as { data?: PsrefItem[] } | null)?.data;
  if (!Array.isArray(data)) return null;
  return data.find((d) => d.SearchResultType === "MT" && d.MachineType?.toUpperCase() === machineType) ?? null;
}

/** Cuántas vistas de la familia se proponen (las que no existan se descartan al verificar). */
const LENOVO_VIEWS = 5;

/**
 * PSREF devuelve la miniatura "CompressedimageForMobileShare" (100×100). Sin
 * esa carpeta está la foto grande, y las otras vistas siguen la numeración
 * _CT1_01, _CT1_02...
 */
export function lenovoPhotos(photo: string | undefined): { url: string }[] {
  if (!photo) return [];
  const full = photo.replace("/CompressedimageForMobileShare/", "/");
  const m = full.match(/^(.*_CT\d+_)(\d{2})(\.\w+)$/);
  if (!m) return [{ url: full }];
  return Array.from({ length: LENOVO_VIEWS }, (_, i) => ({ url: `${m[1]}${String(i + 1).padStart(2, "0")}${m[3]}` }));
}

export function lenovoResult(item: PsrefItem, machineType: string): SourceResult {
  return {
    ...emptyResult("lenovo", "manufacturer"),
    url: item.info?.page ?? null,
    title: item.MarketingName ? `${item.ProductName} (${item.MarketingName})` : item.ProductName ?? null,
    brand: "Lenovo",
    partNumber: machineType,
    images: lenovoPhotos(item.info?.photo),
    category: item.ClassificationName ?? null,
    verified: true,
    matchNote: `tipo de máquina ${machineType} en PSREF (la foto es de la familia, no de la configuración exacta)`,
  };
}

export const lenovoConnector: ManufacturerConnector = {
  source: "lenovo",
  brandKeys: ["lenovo", "thinkpad"],
  async lookup(q: LookupQuery, fetcher: SourceFetcher): Promise<SourceResult | null> {
    const mt = lenovoMachineType(q.pnKey);
    if (!mt) return null;
    const res = await fetcher("lenovo", `${SUGGEST}?kw=${encodeURIComponent(mt)}`, { json: true });
    if (res.status !== 200) return null;
    const item = parsePsref(res.body, mt);
    return item ? lenovoResult(item, mt) : null;
  },
};
