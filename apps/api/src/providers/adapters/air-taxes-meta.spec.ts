import { AirAdapter, mapAirProduct, parseAirCsv } from "./air.adapter";
import { airInternalTaxPercent, mapAirMeta, normalizeAirRubro, splitAirInternalTax } from "../air-meta";
import { AirPortalClient } from "../air-portal-client";

const CSV = `"Codigo","Descripcion","lista5","Tipo","IVA","ROS","MZA","CBA","LUG","Grupo","Rubro","Part Number"
"MON27","Monitor 27 importado","110.5","A","10.5","3","0","0","0","63","001-0320","27X"
"MONCX","Monitor CX nacional","100","A","10.5","1","0","0","0","63","002-0320","CX1"
"MOUSE","Mouse","12.5","A","21","1","0","0","0","63","001-0010","M1"`;

describe("Air: impuestos internos por rubro (como AcuStock)", () => {
  const [mon, cx, mouse] = parseAirCsv(CSV).map((r) => mapAirProduct(r));

  it("MONITORES importados: el precio de lista trae 10,5 % de interno, se guarda el neto", () => {
    expect(mon.price).toBe(100);
    // 100 × (1 + 10,5 % IVA + 10,5 % internos)
    expect(mon.finalPrice).toBe(121);
    expect(mon.ivaPercent).toBe(10.5);
    // La web lee `impuestoInterno` del raw para mostrar la línea de internos.
    expect((mon.raw as Record<string, unknown>).impuestoInterno).toBe(10.5);
  });

  it("MONITORES CX (nacionales) y el resto no pagan internos", () => {
    expect(cx.price).toBe(100);
    expect(cx.finalPrice).toBeUndefined();
    expect((cx.raw as Record<string, unknown>).impuestoInterno).toBeUndefined();
    expect(mouse.price).toBe(12.5);
    expect(mouse.finalPrice).toBeUndefined();
  });

  it("reconoce el rubro con o sin guion o con el nombre pegado", () => {
    expect(normalizeAirRubro("0010320")).toBe("001-0320");
    expect(normalizeAirRubro("001-0320 MONITORES")).toBe("001-0320");
    expect(normalizeAirRubro("")).toBeUndefined();
    expect(airInternalTaxPercent("001-0320")).toBe(10.5);
    expect(airInternalTaxPercent("002-0320")).toBe(0);
  });

  it("sin precio o sin IVA no inventa el final", () => {
    expect(splitAirInternalTax(undefined, 21, 10.5)).toEqual({ price: undefined, finalPrice: undefined });
    expect(splitAirInternalTax(110.5, undefined, 10.5)).toEqual({ price: 100, finalPrice: undefined });
  });
});

/** Ficha de mas_info.php con los campos que lee AcuStock. */
const META = {
  codiart: "MON27",
  title: "MONITOR 27",
  description: "<p>Panel IPS&nbsp;27&quot;</p><br>165 Hz &amp; 1 ms",
  pictures: [{ source: "https://www.air-intra.com/imgart/MON27_1.jpg" }, { url: "https://www.air-intra.com/imgart/nd.png" }],
  imgs: [{ uri: "https://www.air-intra.com/imgart/MON27_2.jpg" }, { uri: "ftp://raro" }],
  attributes: [
    { id: "BRAND", name: "Marca", value: "AOC" },
    { id: "GTIN", name: "Código universal", value: "4038986-12345-6" },
  ],
  garantia: "12",
};

describe("mapAirMeta", () => {
  it("toma la primera foto válida, la descripción en texto, el EAN y la garantía", () => {
    expect(mapAirMeta(META)).toEqual({
      imageUrl: "https://www.air-intra.com/imgart/MON27_1.jpg",
      longDescription: 'Panel IPS 27"\n\n165 Hz & 1 ms',
      description: 'Panel IPS 27" 165 Hz & 1 ms',
      ean: "4038986123456",
      warranty: "12 meses",
    });
  });

  it("acepta el JSON como texto (con BOM) o envuelto en una lista", () => {
    expect(mapAirMeta(`﻿${JSON.stringify(META)}`)?.imageUrl).toBe("https://www.air-intra.com/imgart/MON27_1.jpg");
    expect(mapAirMeta([META])?.ean).toBe("4038986123456");
  });

  it("sin fotos reales ni texto devuelve un parche vacío; sin codiart, null", () => {
    expect(mapAirMeta({ codiart: "X", pictures: [{ source: "https://x/nd.png" }] })).toEqual({});
    expect(mapAirMeta({ texto: "algo" })).toBeNull();
    expect(mapAirMeta("<html>login</html>")).toBeNull();
  });

  it("garantía en warranty.time", () => {
    expect(mapAirMeta({ codiart: "X", warranty: { time: "6", time_u: "meses" } })?.warranty).toBe("6 meses");
  });
});

describe("AirAdapter.enrichDetails", () => {
  afterEach(() => jest.restoreAllMocks());

  function portalWith(getText: jest.Mock) {
    jest.spyOn(AirPortalClient, "login").mockResolvedValue({ getText } as unknown as AirPortalClient);
  }

  it("pide la ficha de cada código y marca las que no traen nada", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      const getText = jest.fn(async (url: string) => (url.includes("MON27") ? JSON.stringify(META) : "{}"));
      portalWith(getText);
      const onItem = jest.fn().mockResolvedValue(undefined);
      const run = new AirAdapter().enrichDetails({ user: "u", pass: "p" }, ["MON27", "VACIO"], onItem);
      await jest.runAllTimersAsync();
      await run;
      expect(getText).toHaveBeenCalledWith("https://www.air-intra.com/2025/ar/mas_info.php?codiart=MON27");
      expect(onItem).toHaveBeenCalledWith("MON27", expect.objectContaining({ imageUrl: "https://www.air-intra.com/imgart/MON27_1.jpg" }));
      expect(onItem).toHaveBeenCalledWith("VACIO", { longDescription: "" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("un 429 corta el lote", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      const getText = jest.fn().mockRejectedValue(new Error("Air GET falló: Request failed with status code 429"));
      portalWith(getText);
      const run = new AirAdapter().enrichDetails({ user: "u", pass: "p" }, ["A", "B", "C"], jest.fn());
      await jest.runAllTimersAsync();
      await run;
      expect(getText).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
