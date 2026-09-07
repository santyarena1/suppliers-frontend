import {
  listingPath,
  mapListingItem,
  parseCategoryNav,
  parseDetail,
  parseListing,
  parseMaxPage,
  parseMoney,
} from "./new-tree-catalog.parser";

const CARD = (id: string, name: string, semaforo: number, price: string, iva = "21,00") => `
<div class="product">
  <div class="campana"><i class="fa fa-heart" onclick="agregarAFavorito(${id}, this); return false;"></i></div>
  <div class="image">
    <a href="https://www.newtree.com.ar/DETALLE/x/ITEM_ID=${id}/OR=/H=/CANT=/newtree.aspx"><img src="https://www.newtree.com.ar/Temp/App_WebSite/App_PictureFiles/Items/4711085948618_400.jpg" alt="${name}"></a>
  </div>
  <div class="description">
    <h4><a id="COD${id}" href="https://www.newtree.com.ar/DETALLE/x/ITEM_ID=${id}/newtree.aspx" class="titprod">${name}</a></h4>
    <div class="precioTachadoFalse" style="display:none"><span class="p1">USD 0,00</span></div>
    <div class="price semaforo${semaforo}" style="display:none">${price}<br><small class="avisoIVA">FINAL</small></div>
    <div class="ivaprod" style="display:none">Incluye IVA ${iva} %</div>
    <a class="btn btn-compra semaforo${semaforo}" onclick="agregarACarrito(${id},'img','${price}'); return false;">AGREGAR</a>
  </div>
</div>`;

describe("new-tree catalog parser", () => {
  it("parses money in Argentine format", () => {
    expect(parseMoney("USD 22,50")).toEqual({ amount: 22.5, currency: "USD" });
    expect(parseMoney("$ 1.530,00")).toEqual({ amount: 1530, currency: "ARS" });
    expect(parseMoney("nada")).toBeNull();
  });

  it("parses listing cards with stock, price and IVA", () => {
    const html = CARD("15375", "Fuente UNDERWOOD 600W", 1, "USD 22,50") + CARD("20227", "Fuente XPG Probe 700W", 4, "USD 54,00", "10,50");
    const items = parseListing(html);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ itemId: "15375", finalPrice: 22.5, currency: "USD", ivaPercent: 21, semaforo: 1, ean: "4711085948618" });
    expect(items[1]).toMatchObject({ itemId: "20227", finalPrice: 54, ivaPercent: 10.5, semaforo: 4 });
  });

  it("maps semaforo1 to stock 0 and derives the net price", () => {
    const [item] = parseListing(CARD("1", "Producto", 1, "USD 121,00"));
    const mapped = mapListingItem(item, { slug: "Fuentes", catId: "2", scatId: "89", name: "Fuentes", categoryName: "Componentes PC" });
    expect(mapped.stock).toBe(0);
    expect(mapped.stockStatus).toBe("Sin stock");
    expect(mapped.price).toBe(100);
    expect(mapped.finalPrice).toBe(121);
    expect(mapped.category).toBe("Componentes PC");
    expect(mapped.subcategory).toBe("Fuentes");
    expect(mapped.externalId).toBe("1");
  });

  it("leaves stock unknown when the card is available", () => {
    const [item] = parseListing(CARD("2", "Producto", 4, "USD 10,00"));
    const mapped = mapListingItem(item, null);
    expect(mapped.stock).toBeUndefined();
    expect(mapped.stockStatus).toBe("Disponible");
  });

  it("reads the category menu with parent names", () => {
    const html = `
      <li><a href="https://www.newtree.com.ar/ARTICULOS/Componentes-PC/CAT_ID=2/m=0/BUS=;/newtree.aspx">Componentes PC</a>
        <ul class="dropdown-menu">
          <li><a href="https://www.newtree.com.ar/ARTICULOS/Fuentes/CAT_ID=2/SCAT_ID=89/m=0/BUS=;/newtree.aspx">Fuentes</a></li>
          <li><a href="https://www.newtree.com.ar/ARTICULOS/Fuentes/CAT_ID=2/SCAT_ID=89/m=0/BUS=;/newtree.aspx">Fuentes</a></li>
          <li><a href="https://www.newtree.com.ar/ARTICULOS/Motherboards/CAT_ID=2/SCAT_ID=11/m=0/BUS=;/newtree.aspx">Motherboards</a></li>
        </ul>
      </li>`;
    const cats = parseCategoryNav(html);
    expect(cats).toEqual([
      { slug: "Fuentes", catId: "2", scatId: "89", name: "Fuentes", categoryName: "Componentes PC" },
      { slug: "Motherboards", catId: "2", scatId: "11", name: "Motherboards", categoryName: "Componentes PC" },
    ]);
    expect(listingPath(cats[0], 3)).toBe("/ARTICULOS/Fuentes/CAT_ID=2/SCAT_ID=89/m=0/BUS=;/A_PAGENUMBER=3/newtree.aspx");
  });

  it("finds the last page of the paginator", () => {
    const html = `<a href="/ARTICULOS/Fuentes;CAT_ID=2;A_PAGENUMBER=2;/newtree.aspx">2</a><a href="/x/A_PAGENUMBER=48/newtree.aspx">48</a>`;
    expect(parseMaxPage(html)).toBe(48);
    expect(parseMaxPage("<div>sin paginador</div>")).toBe(1);
  });

  it("parses the product detail page", () => {
    const html = `
      <h1>Fuente XPG Probe 700W</h1>
      <div>Código: 4711085948618 | Modelo: PROBE700B-BKCAR</div>
      <div>Marca: ADATA</div><div>Stock: <img src="semaforo4.png"></div>
      <div>USD 54,00 Precio Final (Incluye IVA 10,50 %)</div>
      <div>Características Principales:</div><p>● Diseño compacto</p><p>● Ventilador silencioso</p>
      <div>Descargar Ficha Técnica</div>
      <img src="https://www.newtree.com.ar/Temp/App_WebSite/App_PictureFiles/Items/4711085948618_800.jpg">`;
    const detail = parseDetail(html);
    expect(detail.name).toBe("Fuente XPG Probe 700W");
    expect(detail.ean).toBe("4711085948618");
    expect(detail.partNumber).toBe("PROBE700B-BKCAR");
    expect(detail.brand).toBe("ADATA");
    expect(detail.ivaPercent).toBe(10.5);
    expect(detail.finalPrice).toBe(54);
    expect(detail.longDescription).toContain("Diseño compacto");
    expect(detail.imageUrls).toHaveLength(1);
  });
});
