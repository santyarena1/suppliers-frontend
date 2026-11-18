/**
 * Distribuidores cuyos comprobantes (facturas, notas, remitos) NODO baja del
 * portal y guarda (`ProviderOrderDocument`), estén o no unidos a un pedido.
 */
export const DOCUMENT_PROVIDERS = ["ELIT", "SOLUTION_BOX", "NEW_BYTES", "AIR"] as const;

/**
 * Para estos, `pedido.facturado` sale cuando el pedido tiene una factura con
 * datos fiscales (el portal ata la factura al pedido). Para el resto (New Bytes
 * y Air se unen por productos, y puede no unirse), cuando el seguimiento del
 * portal muestra la factura o cuando se une una con datos fiscales.
 */
export const INVOICED_BY_DOCUMENTS = ["ELIT", "SOLUTION_BOX"] as const;

export function invoicedByDocuments(provider: string): boolean {
  return (INVOICED_BY_DOCUMENTS as readonly string[]).includes(provider);
}
