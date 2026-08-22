export function providerOrdersHref(provider: string): string {
  if (provider === "INVID") return "/proveedores/INVID?tab=invid-account";
  if (provider === "NEW_BYTES") return "/proveedores/NEW_BYTES?tab=nb-account";
  if (provider === "ELIT") return "/proveedores/ELIT?tab=elit-account";
  if (provider === "GRUPO_NUCLEO") return "/proveedores/GRUPO_NUCLEO?tab=gn-account";
  if (provider === "AIR") return "/proveedores/AIR?tab=air-account";
  return `/proveedores/${provider}`;
}

export function providerHasOrderHistory(provider: string): boolean {
  return (
    provider === "INVID" ||
    provider === "NEW_BYTES" ||
    provider === "ELIT" ||
    provider === "GRUPO_NUCLEO" ||
    provider === "AIR"
  );
}

export const ORDER_HISTORY_PROVIDERS = ["INVID", "NEW_BYTES", "ELIT", "GRUPO_NUCLEO", "AIR"] as const;

export type PolledDraft = {
  id: string;
  status: string;
  invidOrderNumber: string | null;
  invidWebOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  total: string | number | null;
  errorMessage: string | null;
};
