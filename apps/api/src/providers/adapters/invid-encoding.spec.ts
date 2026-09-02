import { decodeHttpText } from "../http-text";
import { decodeInvidEntities, INVID_NAV_LABELS, latin1BrokenMatches, repairInvidMojibake } from "./invid-encoding";

describe("repairInvidMojibake", () => {
  it("reconstruye Electrodomésticos y otras categorías del menú", () => {
    expect(repairInvidMojibake("Electrodom\uFFFDsticos")).toBe("Electrodomésticos");
    expect(repairInvidMojibake("Perif\uFFFDricos")).toBe("Periféricos");
    expect(repairInvidMojibake("Energ\uFFFDa")).toBe("Energía");
    expect(repairInvidMojibake("Discos R\uFFFDgidos / SSD")).toBe("Discos Rígidos / SSD");
    expect(repairInvidMojibake("Disco R\uFFFDgido Externo")).toBe("Disco Rígido Externo");
    expect(repairInvidMojibake("C\uFFFDmaras IP")).toBe("Cámaras IP");
    expect(repairInvidMojibake("Micr\uFFFDfonos")).toBe("Micrófonos");
    expect(repairInvidMojibake("Multifunci\uFFFDn")).toBe("Multifunción");
    expect(repairInvidMojibake("L\uFFFDnea NVIDIA GEFORCE")).toBe("Línea NVIDIA GEFORCE");
  });

  it("no toca nombres sanos ni inventa si no hay match", () => {
    expect(repairInvidMojibake("Accesorios")).toBe("Accesorios");
    expect(repairInvidMojibake("Notebooks")).toBe("Notebooks");
    expect(repairInvidMojibake("Heladera LG No Fr\uFFFDst")).toBe("Heladera LG No Fr\uFFFDst");
  });

  it("repara mojibake clásico UTF-8 leído como latin1", () => {
    expect(repairInvidMojibake("ElectrodomÃ©sticos")).toBe("Electrodomésticos");
    expect(repairInvidMojibake("PerifÃ©ricos")).toBe("Periféricos");
  });
});

describe("latin1BrokenMatches", () => {
  it("un � equivale a la letra con tilde", () => {
    expect(latin1BrokenMatches("Electrodom\uFFFDsticos", "Electrodomésticos")).toBe(true);
    expect(latin1BrokenMatches("Electrodom\uFFFDsticos", "Periféricos")).toBe(false);
  });
});

describe("decodeHttpText", () => {
  it("decodifica ISO-8859-1 y no deja � en Electrodomésticos", () => {
    const bytes = Buffer.from("Electrodomésticos", "latin1");
    expect(bytes.includes(0xe9)).toBe(true);
    const asUtf8 = bytes.toString("utf8");
    expect(asUtf8).toContain("\uFFFD");
    expect(decodeHttpText(bytes, "text/html; charset=ISO-8859-1")).toBe("Electrodomésticos");
  });

  it("respeta el meta charset si el header no lo trae", () => {
    const html = Buffer.concat([
      Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />', "ascii"),
      Buffer.from("Electrodomésticos", "latin1"),
    ]);
    expect(decodeHttpText(html, "text/html")).toBe(
      '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />Electrodomésticos'
    );
  });
});

describe("decodeInvidEntities", () => {
  it("entiende entidades nombradas y numéricas", () => {
    expect(decodeInvidEntities("Electrodom&eacute;sticos")).toBe("Electrodomésticos");
    expect(decodeInvidEntities("Perif&#233;ricos")).toBe("Periféricos");
  });
});

describe("INVID_NAV_LABELS", () => {
  it("incluye las categorías con tilde del menú", () => {
    expect(INVID_NAV_LABELS).toEqual(expect.arrayContaining(["Electrodomésticos", "Periféricos", "Energía"]));
  });
});
