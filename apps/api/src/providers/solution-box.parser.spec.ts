import {
  currencyFromSign,
  flattenCategories,
  mapSolutionBoxArticle,
  mapSolutionBoxDetail,
  mapSolutionBoxOrders,
  mapSolutionBoxProforma,
  parseMeasure,
} from "./solution-box.parser";
import { mapSolutionBoxCustomer } from "./solution-box-web-client";
import { orderNumberFrom } from "./solution-box-order.service";

describe("solution-box parser", () => {
  it("flattens the category tree keeping parent names", () => {
    const cats = flattenCategories([
      { Codigo: "AUC", Descripcion: "AURICULARES", Rubro_padre: "", Hijos: [] },
      { Codigo: "073", Descripcion: "CABLEADO", Rubro_padre: "", Hijos: [{ Codigo: "CAB", Descripcion: "CABLES", Rubro_padre: "073", Hijos: [] }] },
    ]);
    expect(cats).toEqual([
      { code: "AUC", name: "AURICULARES", parentName: null },
      { code: "073", name: "CABLEADO", parentName: null },
      { code: "CAB", name: "CABLES", parentName: "CABLEADO" },
    ]);
  });

  it("maps articles with price, stock, measures and images", () => {
    const item = mapSolutionBoxArticle(
      {
        Marca: "JABRA", Alias: "23189-999-77", Nombre: "JABRA EVOLVE2 30 SE", Garantia_meses: 12, Parte_fabricante: "23189-999-779",
        Stock: 96, Imagenes: "23189-999-77_1.webp,23189-999-77_2.webp", Peso: "7.6 Kg", Alto: "14 Cm", Ancho: "39 Cm", Profundo: "19 Cm",
        Precio: 119.37, Moneda: "DOLARES", Moneda_Signo: "u$s",
      },
      { code: "AUC", name: "AURICULARES", parentName: null }
    );
    expect(item).toMatchObject({
      externalId: "23189-999-77",
      partNumber: "23189-999-779",
      brand: "JABRA",
      category: "AURICULARES",
      price: 119.37,
      currency: "USD",
      stock: 96,
      warranty: "12 meses",
      weight: 7.6,
      weightUnit: "Kg",
      height: 14,
      dimensionsUnit: "Cm",
      imageUrl: "https://www.solutionbox.com.ar/articulos/thumbs/23189-999-77_1.webp",
    });
    expect(item?.subcategory).toBeUndefined();
    const noPrice = mapSolutionBoxArticle({ Alias: "X", Nombre: "Sin precio", Stock: 0 }, { code: "CAB", name: "CABLES", parentName: "CABLEADO" });
    expect(noPrice).toMatchObject({ stock: 0, category: "CABLEADO", subcategory: "CABLES" });
    expect(noPrice?.price).toBeUndefined();
    expect(mapSolutionBoxArticle({ Alias: "", Nombre: "x" }, null)).toBeNull();
    expect(currencyFromSign("$")).toBe("ARS");
    expect(parseMeasure("2,5 Kg")).toEqual({ value: 2.5, unit: "Kg" });
  });

  it("maps detail descriptions", () => {
    const patch = mapSolutionBoxDetail({ articulo: { Imagenes: "A_1.webp", descripcionArray: ["UPS 1200VA", " ", "FORMATO: TOWER "] } });
    expect(patch.longDescription).toBe("UPS 1200VA\nFORMATO: TOWER");
    expect(patch.imageUrl).toContain("A_1.webp");
  });

  it("maps the proforma totals", () => {
    const p = mapSolutionBoxProforma({
      Numero: 0, Extension: "00",
      items: [{ Alias: "23189-999-77", Moneda: "u$s", Precio: 119.37, Cantidad: 1 }],
      Subtotal_Pesos: { SubTotal: 183773.69, Envio: 0, Iva_Grav: 38592.47, Iva_BC: 0, Impu: 0, Pib: 1837.73, Rec_Financ: 0, Descuento: 0, Per_iva: 0, Recargo_SNC: 0, Total: 224203.9 },
      Subtotal_Dolares: { SubTotal: 119.37, Envio: 0, Iva_Grav: 25.0677, Iva_BC: 0, Impu: 0, Pib: 1.1937, Rec_Financ: 0, Descuento: 0, Per_iva: 0, Recargo_SNC: 0, Total: 145.6314 },
      Cotiz_Dolar: 1530, cond_pago: { Codigo: "70", Descripcion: "CONTADO EFECTIVO $" }, tipo_entrega: { Codigo: "1", Descripcion: "RETIRA" },
    });
    expect(p.items[0]).toEqual({ code: "23189-999-77", qty: 1, price: 119.37, currency: "USD" });
    expect(p.totalsUsd).toMatchObject({ subtotal: 119.37, vat: 25.0677, iibb: 1.1937, total: 145.6314 });
    expect(p.exchange).toBe(1530);
    expect(p.paymentCondition).toEqual({ code: "70", label: "CONTADO EFECTIVO $" });
  });

  it("maps orders and the customer", () => {
    const orders = mapSolutionBoxOrders({
      pedidos: [{
        Pedido_Nro: 1316224, Pedido_Ext: "01", Fecha: "2025-12-22T03:00:00.000Z", Vendedor: "DEBORA", Condicion_Pago: "CONTADO EFECTIVO $",
        Importe: "7,508,409.12", Moneda: "PESOS", Cotizacion_Dolar: "1.00", Factura: "FF-0009-00374996", Estado: "REMITIDO Y FACTURADO",
        Items: [{ Alias: "SRTG6KXLI", Cantidad: 1, Precio: 6677321.18, Moneda: "PESOS" }],
      }],
    });
    expect(orders[0]).toMatchObject({ number: "1316224", extension: "01", date: "2025-12-22", amount: 7508409.12, currency: "ARS", invoice: "FF-0009-00374996" });
    expect(orders[0].items[0]).toEqual({ code: "SRTG6KXLI", qty: 1, price: 6677321.18, currency: "ARS" });
    const c = mapSolutionBoxCustomer({ cliente: { Id: 5768, Cliente: 14652, Email: "a@b.c", Nombre: "A", Apellido: "B", NomCliente: "SOUNDTEC", Cuit: "30-1", Domicilio_facturacion: { Domicilio: "Calle 1", Localidad: "CABA", Codigo_postal: "1416", Codigo_Prov: "C", Pais: "AR", Telefono: "4" }, Domicilio_entrega: { Domicilio: "Calle 1", Localidad: "CABA", Codigo_postal: "1416", Provincia: { Codigo: "C" }, Pais: "AR" }, Condicion_Pago: { Codigo: "70", Descripcion: "CONTADO" }, Tipo_entrega: { Codigo: "1", Descripcion: "RETIRA" }, Cotizacion: 1530 } });
    expect(c).toMatchObject({ userId: 5768, customerId: 14652, companyName: "SOUNDTEC", exchange: 1530, deliveryAddress: { provinceCode: "C" } });
    expect(orderNumberFrom({ Pedido_Nro: 1316225, Pedido_Ext: "01" })).toBe("1316225");
    expect(orderNumberFrom({ pedido: { Numero: "1316226" } })).toBe("1316226");
    expect(orderNumberFrom({ ok: true })).toBeNull();
  });
});
