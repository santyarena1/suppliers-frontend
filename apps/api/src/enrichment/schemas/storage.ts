import { AttributeDef, CategorySchema, GENERIC_ATTRIBUTES } from "./types";

const STORAGE_COMMON: readonly AttributeDef[] = [
  ...GENERIC_ATTRIBUTES,
  { key: "capacity_gb", label: "Capacidad", type: "number", unit: "GB", aliases: ["capacidad", "capacity", "ssd capacity", "hdd capacity"] },
  { key: "interface", label: "Interfaz", type: "text", aliases: ["interfaz", "interface"] },
  { key: "form_factor", label: "Formato", type: "enum", values: ['2.5"', '3.5"', "M.2 2280", "M.2 2242", "M.2 2230", "mSATA"], aliases: ["factor de forma de disco ssd", "ssd form factor", "tamano de hdd", "hdd size"] },
  { key: "read_mbps", label: "Lectura", type: "number", unit: "MB/s", aliases: ["velocidad de lectura", "read speed"] },
  { key: "write_mbps", label: "Escritura", type: "number", unit: "MB/s", aliases: ["velocidad de escritura", "write speed"] },
];

export const SSD_SCHEMA: CategorySchema = {
  categoryKey: "storage_ssd",
  version: 1,
  attributes: [
    ...STORAGE_COMMON,
    { key: "nand_type", label: "Tipo de memoria", type: "text", aliases: ["tipo de memoria", "memory type"] },
    { key: "tbw", label: "TBW", type: "number", unit: "TB", aliases: ["valoracion tbw", "tbw rating"] },
  ],
};

export const HDD_SCHEMA: CategorySchema = {
  categoryKey: "storage_hdd",
  version: 1,
  attributes: [
    ...STORAGE_COMMON,
    { key: "rpm", label: "Velocidad de rotación", type: "number", unit: "RPM", aliases: ["velocidad de rotacion del disco duro", "hdd speed"] },
    { key: "cache_mb", label: "Caché", type: "number", unit: "MB", aliases: ["memoria temporal", "buffer size"] },
  ],
};
