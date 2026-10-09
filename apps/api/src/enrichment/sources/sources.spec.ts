import { readFileSync } from "fs";
import { join } from "path";
import { mapSpecsToSchema } from "../attributes";
import { gtin14, pnKey } from "../keys";
import { schemaFor } from "../schemas";
import { icecatUrls, lookupIcecat, parseIcecat } from "./icecat";
import { extractPage } from "./page-extract";
import { asusConnector, asusResultFromPage, asusSuggestUrl, parseAsusSuggest, pickAsusMatch } from "./manufacturers/asus";
import { lenovoMachineType, lenovoPhotos, parsePsref } from "./manufacturers/lenovo";
import { largerVariants } from "./distributor";
import { redragonConnector, shopifyMatch, ShopifyProduct, hyperxConnector } from "./manufacturers/shopify";
import { parseTplinkSearch, pickTplinkMatch, tplinkResultFromPage } from "./manufacturers/tplink";
import { connectorFor } from "./manufacturers";
import { FetchedBody, LookupQuery, SourceFetcher } from "./types";

const FIX = join(__dirname, "..", "__fixtures__");
const json = (name: string): unknown => JSON.parse(readFileSync(join(FIX, name), "utf8"));
const text = (name: string): string => readFileSync(join(FIX, name), "utf8");

const query = (extra: Partial<LookupQuery>): LookupQuery => ({
  brand: null,
  brandKey: null,
  partNumber: null,
  pnKey: null,
  gtin: null,
  name: "",
  hints: [],
  ...extra,
});

const ASUS_Q = query({
  brand: "ASUS",
  brandKey: "asus",
  partNumber: "90YV0MP2-M0AA00",
  pnKey: pnKey("90YV0MP2-M0AA00"),
  gtin: gtin14("4711636014175"),
  name: "Placa de Video Asus Dual RTX 5060 Ti 8GB OC",
  hints: ["Dual-RTX5060TI-O8G"],
});

/** Fetcher falso: responde con fixtures según la URL y registra lo pedido. */
function fakeFetcher(routes: [RegExp, FetchedBody["body"], number?][]): SourceFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (_source: string, url: string) => {
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    return hit ? { status: hit[2] ?? 200, body: hit[1], url } : { status: 404, body: null, url };
  }) as SourceFetcher & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe("Open Icecat", () => {
  const payload = json("icecat-asus-dual-rtx5060ti.json");

  it("arma la búsqueda por GTIN (13 dígitos) y por marca + código", () => {
    const urls = icecatUrls(ASUS_Q, "usuario");
    expect(urls.map((u) => u.by)).toEqual(["gtin", "code"]);
    expect(urls[0].url).toContain("GTIN=4711636014175");
    expect(urls[1].url).toContain("Brand=ASUS&ProductCode=90YV0MP2-M0AA00");
  });

  it("parsea la respuesta real: galería, specs, resumen y verificación por código", () => {
    const r = parseIcecat(payload, ASUS_Q, "code")!;
    expect(r.verified).toBe(true);
    expect(r.partNumber).toBe("90YV0MP2-M0AA00");
    expect(r.modelCode).toBe("DUAL-RTX5060TI-O8G");
    expect(r.images.length).toBeGreaterThanOrEqual(3);
    expect(r.images[0]).toMatchObject({ width: 2400, height: 2400 });
    expect(r.description).toContain("GeForce RTX 5060 Ti");
    expect(r.category).toBe("Tarjetas gráficas");
    const attrs = mapSpecsToSchema(schemaFor("gpu"), r.specs, "icecat", 0.9);
    expect(attrs.memory_gb.value).toBe(8);
    expect(attrs.memory_type.value).toBe("GDDR7");
    expect(attrs.length_mm.value).toBe(229);
    expect(attrs.recommended_psu_w.value).toBe(550);
    expect(attrs.chipset_brand.value).toBe("NVIDIA");
  });

  it("no da por verificado un producto con otro código", () => {
    const r = parseIcecat(payload, { ...ASUS_Q, pnKey: "OTROCODIGO", gtin: null }, "code")!;
    expect(r.verified).toBe(false);
  });

  it("si el GTIN no está, prueba con marca + código", async () => {
    const fetcher = fakeFetcher([
      [/GTIN=/, { msg: "The GTIN can not be found" }, 400],
      [/ProductCode=/, payload],
    ]);
    const r = await lookupIcecat(ASUS_Q, "usuario", fetcher);
    expect(fetcher.calls).toHaveLength(2);
    expect(r?.verified).toBe(true);
  });
});

describe("ASUS", () => {
  it("solo acepta el resultado cuya URL termina en el código de modelo", () => {
    const items = parseAsusSuggest(json("asus-suggest-dual-rtx5060ti.json"));
    expect(items.length).toBe(4);
    expect(pickAsusMatch(items, ASUS_Q)?.Url).toMatch(/DUAL-RTX5060TI-O8G\/$/);
    expect(pickAsusMatch(items, { ...ASUS_Q, hints: ["DUAL-RTX5060TI-O16G-X"] })).toBeNull();
  });

  it("lee galería y descripción de la ficha oficial (JSON-LD)", () => {
    const url = "https://www.asus.com/ar/Motherboards-Components/Graphics-Cards/Dual/DUAL-RTX5060TI-O8G/";
    const r = asusResultFromPage(text("asus-page-dual-rtx5060ti-o8g.html"), url, "DUAL-RTX5060TI-O8G");
    expect(r.images.length).toBe(10);
    expect(r.description).toContain("GDDR7");
    expect(r.category).toBe("Dual");
  });

  it("conector completo con fixtures", async () => {
    const fetcher = fakeFetcher([
      [/odinapi/, json("asus-suggest-dual-rtx5060ti.json")],
      [/DUAL-RTX5060TI-O8G\/$/, text("asus-page-dual-rtx5060ti-o8g.html")],
    ]);
    const r = await asusConnector.lookup(ASUS_Q, fetcher);
    expect(r?.verified).toBe(true);
    expect(fetcher.calls[0]).toBe(asusSuggestUrl("90YV0MP2-M0AA00"));
  });
});

describe("TP-Link", () => {
  const urls = parseTplinkSearch(text("tplink-search-archer-c6.html"));
  const q = query({ brand: "TP-Link", brandKey: "tplink", partNumber: "ARCHER C6", pnKey: "ARCHERC6", name: "Router TP-Link Archer C6 AC1200 Dual Band" });

  it("elige archer-c6 y no archer-c60 ni archer-c6u", () => {
    expect(pickTplinkMatch(urls, q)?.model).toBe("archer-c6");
    expect(pickTplinkMatch(urls, { ...q, pnKey: null, partNumber: null })?.model).toBe("archer-c6");
  });

  it("Deco X50 (3-pack): el modelo aparece como palabras en el part number", () => {
    const deco = ["https://www.tp-link.com/ar/home-networking/deco/deco-x50/", "https://www.tp-link.com/ar/home-networking/deco/deco-x50-outdoor/", "https://www.tp-link.com/ar/home-networking/deco/deco-x55/"];
    const m = pickTplinkMatch(deco, query({ partNumber: "Deco X50(3-pack)", pnKey: "DECOX503PACK", name: "Extensor Wifi Mesh Deco X50 Tp-link AX3000 Pack De 3" }));
    expect(m?.model).toBe("deco-x50");
  });

  it("toma og:image y la galería grande", () => {
    const r = tplinkResultFromPage(text("tplink-page-archer-c6.html"), "https://www.tp-link.com/ar/home-networking/wifi-router/archer-c6/", "archer-c6");
    expect(r.images.length).toBeGreaterThanOrEqual(6);
    expect(r.images.every((i) => !/thumb|normal/.test(i.url))).toBe(true);
    expect(r.title).toContain("Archer C6");
  });
});

describe("Lenovo PSREF", () => {
  it("toma el tipo de máquina del part number MTM", () => {
    expect(lenovoMachineType("83K1003WAR")).toBe("83K1");
    expect(lenovoMachineType("GY50R91293")).toBe("GY50");
    expect(lenovoMachineType("ABC")).toBeNull();
  });

  it("usa la foto grande (no la miniatura) y propone las otras vistas", () => {
    const photos = lenovoPhotos("https://psrefstuff.lenovo.com/syspool/Sys/Image/IdeaPad/X/CompressedimageForMobileShare/X_CT1_01.png");
    expect(photos[0].url).toBe("https://psrefstuff.lenovo.com/syspool/Sys/Image/IdeaPad/X/X_CT1_01.png");
    expect(photos).toHaveLength(5);
    expect(photos[4].url).toMatch(/_CT1_05\.png$/);
  });

  it("parsea la sugerencia de PSREF", () => {
    const item = parsePsref(json("lenovo-suggest.json"), "83K1");
    expect(item?.ProductName).toBe("IdeaPad Slim 3 15IRH10");
    expect(item?.info?.photo).toMatch(/^https:\/\/psrefstuff/);
  });
});

describe("tiendas oficiales Shopify (HyperX, Redragon)", () => {
  it("HyperX: coincide por SKU", () => {
    const p = json("hyperx-product-cloud-ii.json") as ShopifyProduct;
    expect(shopifyMatch(p, query({ pnKey: "4P5M0AA" }))).toContain("SKU");
  });

  it("Redragon: coincide por código de barras o por modelo exacto en el título", () => {
    const p = json("redragon-product-cobra-m711.json") as ShopifyProduct;
    expect(shopifyMatch(p, query({ gtin: gtin14("4897075397700") }))).toContain("código de barras");
    expect(shopifyMatch(p, query({ hints: ["M711"] }))).toContain("M711");
    expect(shopifyMatch(p, query({ hints: ["M712"] }))).toBeNull();
  });

  it("conector Redragon completo con fixtures", async () => {
    const fetcher = fakeFetcher([
      [/suggest\.json/, json("redragon-suggest.json")],
      [/cobra-m711\.js$/, json("redragon-product-cobra-m711.json")],
    ]);
    const r = await redragonConnector.lookup(query({ brandKey: "redragon", name: "Mouse Redragon Cobra M711", hints: ["M711"] }), fetcher);
    expect(r?.verified).toBe(true);
    expect(r?.images[0].url).toMatch(/^https:\/\/cdn\.shopify\.com/);
  });

  it("cada marca va a su conector", () => {
    expect(connectorFor("hyperx")).toBe(hyperxConnector);
    expect(connectorFor("msi")).toBeNull();
    expect(connectorFor("lenovocomputos")?.source).toBe("lenovo");
    expect(connectorFor("hyperxperifericos")?.source).toBe("hyperx");
  });
});

describe("fotos de distribuidores", () => {
  it("prueba primero la variante grande de Elit", () => {
    expect(largerVariants("https://images.elit.com.ar/p/1/i/AB_s.webp")).toEqual(["https://images.elit.com.ar/p/1/i/AB_l.webp", "https://images.elit.com.ar/p/1/i/AB_s.webp"]);
    expect(largerVariants("https://otro.com/a_s.webp")).toEqual(["https://otro.com/a_s.webp"]);
  });
});

describe("extracción de fichas web", () => {
  it("ignora JSON-LD roto y lee og:", () => {
    const page = extractPage(`<meta property="og:image" content="/img/a.jpg"><script type="application/ld+json">{roto</script>`, "https://x.com/p/1");
    expect(page.ogImage).toBe("https://x.com/img/a.jpg");
    expect(page.product).toBeNull();
  });
});
