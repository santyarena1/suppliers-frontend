import {
  airLoginRejected,
  airPortalArticles,
  applyAirAccountPrices,
  mapAirProduct,
  parseAirCsv,
  parseAirPrice,
  parseAirTermMap,
  resolveAirTerm,
} from "./air.adapter";

const RUBROS_SAMPLE = [
  { id: 0, name: "Todos los Rubros", hay: 0, grupos: [] },
  { id: "001-0010", name: "ACCESORIOS", hay: 274, grupos: [] },
  { id: "001-0030", name: "ACCESORIOS CABLES", hay: 177, grupos: [] },
  { id: "002-0280", name: "MEMORIAS", hay: 142, grupos: [] },
];

const GRUPOS_SAMPLE = [
  { id: 0, name: "Todos los Grupos", hay: 0, rubros: [] },
  { id: 63, name: "LOGITECH", hay: 40, rubros: [] },
  { id: 5, name: "HP", hay: 31, rubros: [] },
  { id: 32, name: "ACCESORIOS", hay: 186, rubros: [] },
];

const CSV = `"Codigo","Descripcion","lista5","Tipo","IVA","ROS","MZA","CBA","LUG","Grupo","Rubro","Part Number"
"MX123","Mouse Logitech 19" USB","12.5","A","21","1","0","2","0","63","001-0010","910-001"
"HP001","Notebook HP","100","A","10.5","0","0","0","0","5","002-0280","ABC"
"X000","Sin ids","1","A","21","0","0","0","0","0","",""
"Y000","Ids desconocidos","1","A","21","0","0","0","0","9999","999-9999","PN"
`;

describe("parseAirTermMap / resolveAirTerm", () => {
  const rubros = parseAirTermMap(RUBROS_SAMPLE);
  const grupos = parseAirTermMap(GRUPOS_SAMPLE);

  it("indexa rubros por id con guión y grupos numéricos, y saltea el placeholder Todos", () => {
    expect(rubros.get("001-0010")).toBe("ACCESORIOS");
    expect(grupos.get("63")).toBe("LOGITECH");
    expect(rubros.has("0")).toBe(false);
    expect(grupos.has("0")).toBe(false);
  });

  it("resuelve el id exacto y no inventa nombre si no hay match", () => {
    expect(resolveAirTerm(rubros, "001-0010")).toBe("ACCESORIOS");
    expect(resolveAirTerm(grupos, "63")).toBe("LOGITECH");
    expect(resolveAirTerm(grupos, "063")).toBe("LOGITECH");
    expect(resolveAirTerm(rubros, "0010010")).toBe("ACCESORIOS");
    expect(resolveAirTerm(rubros, "999-9999")).toBeUndefined();
    expect(resolveAirTerm(grupos, "0")).toBeUndefined();
    expect(resolveAirTerm(grupos, "")).toBeUndefined();
  });
});

describe("parseAirCsv / mapAirProduct", () => {
  const rows = parseAirCsv(CSV);
  const rubros = parseAirTermMap(RUBROS_SAMPLE);
  const grupos = parseAirTermMap(GRUPOS_SAMPLE);

  it("parsea el CSV aunque la descripción traiga pulgadas con comilla", () => {
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      Codigo: "MX123",
      Descripcion: 'Mouse Logitech 19" USB',
      Grupo: "63",
      Rubro: "001-0010",
    });
  });

  it("mapea Rubro→categoría y Grupo→marca con nombres, no códigos", () => {
    const p = mapAirProduct(rows[0], rubros, grupos);
    expect(p.externalId).toBe("MX123");
    expect(p.category).toBe("ACCESORIOS");
    expect(p.brand).toBe("LOGITECH");
    expect(p.subcategory).toBeUndefined();
    expect(p.price).toBe(12.5);
    expect(p.currency).toBe("USD");
    expect(p.ivaPercent).toBe(21);
    expect(p.stock).toBe(3);
    expect(p.partNumber).toBe("910-001");
  });

  it("no guarda el código si el diccionario no tiene ese id", () => {
    const p = mapAirProduct(rows[3], rubros, grupos);
    expect(p.category).toBeUndefined();
    expect(p.brand).toBeUndefined();
  });

  it("deja category/brand vacíos si el CSV no trae rubro/grupo", () => {
    const p = mapAirProduct(rows[2], rubros, grupos);
    expect(p.category).toBeUndefined();
    expect(p.brand).toBeUndefined();
  });

  it("toma el precio de la lista de esta cuenta, no de una columna lista vacía", () => {
    const csv = `"Codigo","Descripcion","lista1","lista3","Tipo","IVA","ROS","MZA","CBA","LUG","Grupo","Rubro","Part Number"
"MX9","Mouse","0","1.234,50","A","21","1","0","0","0","63","001-0010","910"
`;
    const parsed = parseAirCsv(csv);
    expect(parsed[0].lista5).toBe("1.234,50");
    expect(mapAirProduct(parsed[0]).price).toBe(1234.5);
    expect(mapAirProduct(parsed[0]).stock).toBe(1);
    expect(mapAirProduct(parsed[0]).ivaPercent).toBe(21);
  });

  it("pisa el precio del CSV con el precio.lista de la cuenta", () => {
    const parsed = parseAirCsv(CSV);
    const applied = applyAirAccountPrices(parsed, new Map([["MX123", 44.2]]));
    expect(applied).toBe(1);
    expect(mapAirProduct(parsed[0]).price).toBe(44.2);
    expect(mapAirProduct(parsed[1]).price).toBe(100);
  });

  it("lee precio.lista aunque el portal envuelva la lista y el código no coincida en mayúsculas", () => {
    const articles = airPortalArticles({ articulos: [{ codiart: "mx123", precio: { lista: "44,20" } }] });
    expect(articles).toHaveLength(1);
    const parsed = parseAirCsv(CSV);
    const prices = new Map(articles.map((a) => [a.codiart!.trim().toUpperCase(), 44.2]));
    expect(applyAirAccountPrices(parsed, prices)).toBe(1);
    expect(mapAirProduct(parsed[0]).price).toBe(44.2);
  });
});

describe("parseAirPrice / airLoginRejected", () => {
  it("lee importes con coma decimal y separador de miles", () => {
    expect(parseAirPrice("12.5")).toBe(12.5);
    expect(parseAirPrice("12,50")).toBe(12.5);
    expect(parseAirPrice("1.234,50")).toBe(1234.5);
    expect(parseAirPrice("u$s 10")).toBe(10);
    expect(parseAirPrice("")).toBeUndefined();
    expect(parseAirPrice("abc")).toBeUndefined();
  });

  it("detecta un login rechazado y no confunde una sesión iniciada", () => {
    expect(airLoginRejected(`<meta name="action_state" content="-1">`)).toBe(true);
    expect(airLoginRejected(`<meta name="cuenta" content="">Inicia sesión con tu cuenta`)).toBe(true);
    expect(airLoginRejected(`<meta name="cuenta" content="1234">`)).toBe(false);
  });
});
