import { brandAliases, groupRows, GroupingRow } from "./grouping";

const row = (provider: string, externalId: string, extra: Partial<GroupingRow> = {}): GroupingRow => ({
  provider,
  externalId,
  name: `Producto ${externalId}`,
  brand: null,
  partNumber: null,
  ean: null,
  category: null,
  ...extra,
});

const byMember = (groups: ReturnType<typeof groupRows>) =>
  Object.fromEntries(groups.flatMap((g) => g.members.map((m) => [`${m.provider}:${m.externalId}`, g.key])));

describe("agrupación en productos maestros", () => {
  it("une por EAN válido aunque el part number difiera", () => {
    const groups = groupRows([
      row("ELIT", "1", { ean: "4711636014175", brand: "ASUS", partNumber: "90YV0MP2-M0AA00", name: "Placa ASUS Dual RTX 5060 Ti" }),
      row("AIR", "x", { ean: "04711636014175", brand: "Asus", partNumber: "DUAL-RTX5060TI-O8G", name: "VGA ASUS DUAL RTX 5060 TI 8GB" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matchKind).toBe("EAN");
    expect(groups[0].key).toBe("ean:04711636014175");
  });

  it("une por marca + part number normalizado", () => {
    const groups = groupRows([
      row("ELIT", "1", { brand: "Logitech", partNumber: "910-005793", name: "Mouse Logitech G203" }),
      row("NEW_BYTES", "2", { brand: "LOGITECH", partNumber: "910005793", name: "MOUSE LOGITECH G203 LIGHTSYNC" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ matchKind: "PN", key: "pn:logitech:910005793", doubtful: false });
  });

  it("no une un EAN inválido", () => {
    const groups = groupRows([row("A", "1", { ean: "4711636014176" }), row("B", "2", { ean: "4711636014176" })]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.matchKind === "SINGLE")).toBe(true);
  });

  it("una ficha sin marca se suma al part number si hay una sola marca con ese código", () => {
    const groups = groupRows([
      row("A", "1", { brand: "Kingston", partNumber: "SA400S37/480G", name: "SSD Kingston A400 480GB" }),
      row("B", "2", { brand: null, partNumber: "SA400S37480G", name: "Disco SSD A400 480GB Kingston" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("marca como dudoso el part number compartido por marcas distintas", () => {
    const groups = groupRows([
      row("A", "1", { brand: "Genius", partNumber: "X-100", name: "Mouse Genius" }),
      row("B", "2", { brand: "Noga", partNumber: "X100", name: "Mouse Noga" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.doubtful)).toBe(true);
  });

  it("marca como dudoso un EAN que junta nombres muy distintos", () => {
    const groups = groupRows([
      row("A", "1", { ean: "4711636014175", brand: "ASUS", name: "Placa de video ASUS Dual" }),
      row("B", "2", { ean: "4711636014175", brand: "ASUS", name: "Cable HDMI 2 metros" }),
    ]);
    expect(groups[0].doubtful).toBe(true);
    expect(groups[0].doubtReason).toContain("nombres muy distintos");
  });

  it("es idempotente: mismo resultado sin importar el orden de las fichas", () => {
    const rows = [
      row("ELIT", "1", { brand: "HP", partNumber: "6L6Y9AA", name: "Mouse HP 1" }),
      row("AIR", "2", { brand: "HP", partNumber: "6L6Y9-AA", name: "Mouse HP 1 negro" }),
      row("GC", "3", { brand: "HP", partNumber: "OTRO1", name: "Teclado HP" }),
      row("GC", "4", { ean: "0199291014176", name: "Algo" }),
      row("ELIT", "5", { ean: "199291014176", name: "Algo más" }),
    ];
    const a = byMember(groupRows(rows));
    const b = byMember(groupRows([...rows].reverse()));
    expect(a).toEqual(b);
    expect(a["GC:3"]).toBe("single:GC:3");
  });

  it("variantes de marca con el mismo part number se unen sin quedar dudosas", () => {
    const groups = groupRows([
      row("AIR", "1", { brand: "LENOVO", partNumber: "21SH0022AC", name: "Notebook Lenovo ThinkPad E14" }),
      row("GC", "2", { brand: "LENOVO COMPUTOS", partNumber: "21SH0022AC", name: "Notebook Lenovo ThinkPad E14 Gen 6" }),
      row("GC", "3", { brand: "LENOVO COMPUTOS", partNumber: "82YU012PAR", name: "Notebook Lenovo IdeaPad" }),
    ]);
    const main = groups.find((x) => x.members.length === 2)!;
    expect(main).toMatchObject({ key: "pn:lenovo:21SH0022AC", doubtful: false });
    expect(groups.find((x) => x.members[0].externalId === "3")?.brandKey).toBe("lenovo");
  });

  it("no inventa familias de marcas que no comparten códigos", () => {
    expect(brandAliases([{ brandKey: "intel", pn: "BX8071512400" }, { brandKey: "intellinet", pn: "523301" }]).size).toBe(0);
    expect(brandAliases([{ brandKey: "hp", pn: "ABC123" }, { brandKey: "hpe", pn: "ABC123" }]).size).toBe(0);
  });
});
