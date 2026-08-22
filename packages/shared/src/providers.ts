export type Provider =
  | "NEW_BYTES"
  | "ELIT"
  | "GRUPO_NUCLEO"
  | "AIR"
  | "NEW_TREE"
  | "INVID"
  | "GC"
  | "POLYTECH"
  | "ASHIR"
  | "HDC"
  | "SOLUTION_BOX"
  | "DISTECNA"
  | "CEVEN"
  | "DIAPSTORE";

export const ALL_PROVIDERS: Provider[] = [
  "NEW_BYTES",
  "ELIT",
  "GRUPO_NUCLEO",
  "AIR",
  "NEW_TREE",
  "INVID",
  "GC",
  "POLYTECH",
  "ASHIR",
  "HDC",
  "SOLUTION_BOX",
  "DISTECNA",
  "CEVEN",
  "DIAPSTORE",
];

/** Nombre comercial normalizado de cada proveedor. Es lo único que se muestra en pantalla. */
export const PROVIDER_LABELS: Record<Provider, string> = {
  NEW_BYTES: "New Bytes",
  ELIT: "Elit",
  GRUPO_NUCLEO: "Grupo Núcleo",
  AIR: "Air",
  NEW_TREE: "New Tree",
  INVID: "Invid",
  GC: "GC",
  POLYTECH: "Polytech",
  ASHIR: "Ashir",
  HDC: "HDC",
  SOLUTION_BOX: "Solution Box",
  DISTECNA: "Distecna",
  CEVEN: "Ceven",
  DIAPSTORE: "Diapstore",
};

export interface ProductDTO {
  provider: Provider;
  name: string;
  price: string;
  imageUrl: string;
  externalId: string;
  locationAir?: string | null;
}
