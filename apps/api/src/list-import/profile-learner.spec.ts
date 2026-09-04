import { ProfileLearner, parseAiProfile } from "./profile-learner";
import type { SheetAnalysis } from "./types";

const sheet: SheetAnalysis = {
  sheetIndex: 1,
  sheetName: "Lista",
  headerRow: 3,
  headers: ["Código", "Producto", "Precio", "Obs"],
  normalizedHeaders: ["codigo", "producto", "precio", "obs"],
  dataRows: [
    { index: 4, cells: ["A1", "Uno", "1.234,50", null], divider: "LOGITECH" },
    { index: 5, cells: ["A2", "Dos", "99,00", null], divider: "LOGITECH" },
  ],
  dividers: ["LOGITECH"],
  rowsTotal: 6,
  kinds: [],
};

describe("parseAiProfile", () => {
  test("acepta un mapeo válido y descarta campos desconocidos o repetidos", () => {
    const parsed = parseAiProfile(
      {
        columnMap: { Código: "externalId", Producto: "name", Precio: "price", Obs: "inventado", Otra: "brand" },
        currency: "ARS",
        priceIncludesIva: true,
        ivaPercent: 21,
        numberFormat: "COMMA",
        dividerMeaning: "BRAND",
        reasoning: "ok",
      },
      sheet.headers
    );
    expect(parsed?.spec.columnMap).toEqual({ Código: "externalId", Producto: "name", Precio: "price", Obs: null });
    expect(parsed?.spec).toMatchObject({ currency: "ARS", priceIncludesIva: true, ivaPercent: 21, numberFormat: "COMMA", dividerMeaning: "BRAND" });
  });

  test("sin nombre o sin precio no sirve", () => {
    expect(parseAiProfile({ columnMap: { Código: "externalId", Precio: "price" } }, sheet.headers)).toBeNull();
    expect(parseAiProfile({ columnMap: { Producto: "name" } }, sheet.headers)).toBeNull();
    expect(parseAiProfile("basura", sheet.headers)).toBeNull();
  });
});

describe("ProfileLearner", () => {
  test("sin clave de OpenAI usa la heurística y detecta formato numérico y divisores", async () => {
    const ai = { isConfigured: jest.fn().mockResolvedValue(false), chatJson: jest.fn() };
    const learner = new ProfileLearner(ai as never);
    const learned = await learner.learn(sheet);
    expect(learned.fromAi).toBe(false);
    expect(learned.spec.columnMap).toEqual({ Código: "externalId", Producto: "name", Precio: "price", Obs: null });
    expect(learned.spec.numberFormat).toBe("COMMA");
    expect(learned.spec.dividerMeaning).toBe("BRAND");
    expect(learned.spec.sheetIndex).toBe(1);
    expect(learned.spec.headerRow).toBe(3);
    expect(ai.chatJson).not.toHaveBeenCalled();
  });

  test("con IA, combina la propuesta con lo que decidió el analizador", async () => {
    const ai = {
      isConfigured: jest.fn().mockResolvedValue(true),
      chatJson: jest.fn().mockResolvedValue({
        columnMap: { Código: "externalId", Producto: "name", Precio: "finalPrice" },
        priceIncludesIva: true,
        dividerMeaning: "CATEGORY",
        reasoning: "Precio parece con IVA",
      }),
    };
    const learner = new ProfileLearner(ai as never);
    const learned = await learner.learn(sheet);
    expect(learned.fromAi).toBe(true);
    expect(learned.spec.columnMap.Precio).toBe("finalPrice");
    expect(learned.spec.dividerMeaning).toBe("CATEGORY");
    expect(learned.spec.sheetIndex).toBe(1);
    expect(learned.reasoning).toBe("Precio parece con IVA");
    const prompt = ai.chatJson.mock.calls[0][0] as string;
    expect(prompt).toContain("Código");
    expect(prompt).toContain("LOGITECH");
  });

  test("si la IA falla, cae a la heurística sin romper", async () => {
    const ai = { isConfigured: jest.fn().mockResolvedValue(true), chatJson: jest.fn().mockRejectedValue(new Error("timeout")) };
    const learned = await new ProfileLearner(ai as never).learn(sheet);
    expect(learned.fromAi).toBe(false);
    expect(learned.spec.columnMap.Producto).toBe("name");
  });
});
