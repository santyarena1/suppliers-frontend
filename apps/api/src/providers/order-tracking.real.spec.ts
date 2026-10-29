import { trackingFromPortal } from "./order-tracking";
import { elitTrackingRow, invidTrackingRow } from "./order-tracking.service";

/**
 * Datos reales leídos de los portales el 29/10/2026 (solo los campos que usa el
 * seguimiento) y la etapa que corresponde según lo que muestra cada portal.
 */
describe("seguimiento con datos reales de los portales (29/10)", () => {
  it.each([
    // Elit: confirmado pero demorado; sin factura ni remito (los manda como «0»).
    [{ internalNumber: "150305897", status: "No preparado", statusDescription: "Tu pedido fue confirmado y se encuentra con demoras en su preparación.", invoiceNumber: "0", dispatchNote: "0", trackingSupplier: "TRANSPORTE OTI" }, "CONFIRMED", null],
    // Elit: remitido y el transporte lo entregó.
    [{ internalNumber: "150304227", status: "Remitido", statusDescription: "Tu pedido ya fue preparado.", invoiceNumber: "2000240284", dispatchNote: "3400146305", tracking: "1-27693", trackingStatus: "ENTREGADA CONFORME", trackingSupplier: "TRANSPORTE OTI" }, "DELIVERED", "2000240284"],
    // Elit: remitido, sin dato del transporte.
    [{ internalNumber: "150292885", status: "Remitido", statusDescription: "Tu pedido ya fue preparado.", invoiceNumber: "2000238778", dispatchNote: "3400140202", trackingSupplier: "TRANSPORTE OTI" }, "SHIPPED", "2000238778"],
    // Elit: anulado.
    [{ internalNumber: "150295124", status: "Anulado", invoiceNumber: "0", dispatchNote: "0" }, "CANCELLED", null],
  ])("Elit %#", (raw, stage, invoice) => {
    const u = trackingFromPortal(elitTrackingRow(raw));
    expect(u.stage).toBe(stage);
    expect(u.invoice).toBe(invoice);
  });

  it.each([
    [{ webOrderNumber: "217062", orderNumber: "633967", status: "Cerrado", invoice: "-" }, "CONFIRMED"],
    [{ webOrderNumber: "217778", orderNumber: "635399", status: "Cancelado", invoice: "-" }, "CANCELLED"],
    [{ webOrderNumber: "", orderNumber: "623541", status: "Vencido", invoice: "-" }, "CANCELLED"],
  ])("Invid %#", (raw, stage) => {
    const u = trackingFromPortal(invidTrackingRow(raw));
    expect(u.stage).toBe(stage);
    expect(u.invoice).toBeNull();
  });

  it.each([
    ["Entregado Cobrado", "DELIVERED"],
    ["Armado Finalizado", "CONFIRMED"],
  ])("New Bytes, seguimiento de la orden «%s» → %s", (state, stage) => {
    // Las órdenes de compra no traen estado; su `trackingNumber` («MIN-…») es interno y no se pasa.
    expect(trackingFromPortal({ numbers: ["10486513"], status: state, hints: [state] }).stage).toBe(stage);
  });
});
