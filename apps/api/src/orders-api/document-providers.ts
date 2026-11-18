/**
 * Distribuidores cuyas facturas y remitos NODO baja del portal y guarda
 * (`ProviderOrderDocument`). Para estos, `pedido.facturado` sale cuando hay
 * datos fiscales (QR o texto del PDF); para el resto, cuando el seguimiento
 * del portal muestra el número de factura.
 */
export const DOCUMENT_PROVIDERS = ["ELIT", "SOLUTION_BOX"] as const;

export function storesDocuments(provider: string): boolean {
  return (DOCUMENT_PROVIDERS as readonly string[]).includes(provider);
}
