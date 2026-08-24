import { BadRequestException, Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import type { NormalizedProduct } from "./types";

/**
 * Alias de encabezados reconocidos por campo, en español e inglés, para no
 * depender de que la planilla tenga exactamente un nombre fijo de columna.
 * Comparación case-insensitive e ignorando espacios/acentos. Si una columna
 * no matchea ningún alias, se ignora (no se inventa un valor).
 */
const HEADER_ALIASES: Record<keyof NormalizedProduct, string[]> = {
  externalId: ["externalid", "codigo", "código", "sku", "id", "codart", "codiart"],
  sku: ["sku", "codigo", "código"],
  partNumber: ["partnumber", "part_number", "parte", "codigoalfa"],
  ean: ["ean", "upc", "codigobarras", "codigodebarras"],
  name: ["nombre", "name", "descripcion", "descripción", "producto", "articulo", "artículo", "title", "titulo"],
  brand: ["marca", "brand"],
  category: ["categoria", "categoría", "rubro", "category"],
  subcategory: ["subcategoria", "subcategoría", "grupo", "subcategory"],
  description: ["descripcion", "descripción", "description"],
  longDescription: ["descripcionlarga", "descripciondetallada", "longdescription"],
  price: ["precio", "price", "preciousd", "preciodolar", "costo"],
  finalPrice: ["preciofinal", "finalprice", "preciolista"],
  currency: ["moneda", "currency"],
  ivaPercent: ["iva", "ivapercent", "alicuotaiva", "alicuota", "taxrate", "porcentajeiva"],
  stock: ["stock", "cantidad", "disponible", "existencia"],
  stockStatus: ["estadostock", "stockstatus", "estado"],
  imageUrl: ["imagen", "imageurl", "foto", "urlimagen"],
  productUrl: ["url", "link", "producturl"],
  locationAir: ["sucursal", "deposito", "depósito", "ubicacion", "ubicación", "location"],
  warranty: ["garantia", "garantía", "warranty"],
  weight: ["peso", "weight"],
  weightUnit: ["unidadpeso", "weightunit"],
  height: ["alto", "altura", "height"],
  width: ["ancho", "width"],
  length: ["largo", "profundidad", "length"],
  dimensionsUnit: ["unidaddimensiones", "dimensionsunit"],
  volume: ["volumen", "volume"],
  tags: ["tags", "etiquetas", "atributos"],
  raw: [],
};

function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

@Injectable()
export class FileImportService {
  /** Parsea un archivo .xlsx/.xls/.csv en filas de objetos, usando la primera fila como encabezado. */
  parseFile(buffer: Buffer, filename: string): Record<string, unknown>[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      throw new BadRequestException(`No se pudo leer "${filename}" — ¿es un Excel o CSV válido?`);
    }
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException("El archivo no tiene ninguna hoja con datos");
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });
    if (rows.length === 0) throw new BadRequestException("El archivo no tiene filas de datos (solo encabezado o vacío)");
    return rows;
  }

  /**
   * Mapea filas genéricas a NormalizedProduct usando los alias de columna
   * conocidos. Devuelve también cuántas filas se descartaron por no tener
   * al menos externalId + name (lo mínimo indispensable) y qué columnas del
   * archivo no se pudieron mapear a ningún campo, para mostrárselo al
   * usuario — nada se inventa, lo que no matchea queda afuera.
   */
  mapRows(rows: Record<string, unknown>[]): { items: NormalizedProduct[]; skipped: number; unmappedColumns: string[] } {
    const originalHeaders = Object.keys(rows[0] ?? {});
    const headerToField = new Map<string, keyof NormalizedProduct>();
    const usedHeaders = new Set<string>();

    for (const header of originalHeaders) {
      const norm = normalizeHeader(header);
      for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof NormalizedProduct, string[]][]) {
        if (aliases.includes(norm) && !headerToField.has(header)) {
          headerToField.set(header, field);
          usedHeaders.add(header);
          break;
        }
      }
    }

    const items: NormalizedProduct[] = [];
    let skipped = 0;

    for (const row of rows) {
      const mapped: Partial<NormalizedProduct> = {};
      for (const [header, field] of headerToField) {
        const value = row[header];
        if (value === undefined || value === null || value === "") continue;
        (mapped as Record<string, unknown>)[field] =
          ["price", "finalPrice", "ivaPercent", "stock", "weight", "height", "width", "length", "volume"].includes(field)
            ? Number(value)
            : String(value);
      }
      if (!mapped.externalId || !mapped.name) {
        skipped++;
        continue;
      }
      items.push({ ...mapped, raw: row } as NormalizedProduct);
    }

    const unmappedColumns = originalHeaders.filter((h) => !usedHeaders.has(h));
    return { items, skipped, unmappedColumns };
  }
}
