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

export interface ProductDTO {
  provider: Provider;
  name: string;
  price: string;
  imageUrl: string;
  externalId: string;
  locationAir?: string | null;
}
