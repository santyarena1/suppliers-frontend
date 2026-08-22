export function providerOrdersHref(provider: string): string {
  if (provider === "INVID") return "/proveedores/INVID?tab=invid-account";
  if (provider === "NEW_BYTES") return "/proveedores/NEW_BYTES?tab=nb-account";
  return `/proveedores/${provider}`;
}

export function providerHasOrderHistory(provider: string): boolean {
  return provider === "INVID" || provider === "NEW_BYTES";
}

export const ORDER_HISTORY_PROVIDERS = ["INVID", "NEW_BYTES"] as const;
