import * as XLSX from "xlsx";
import { ListImportService, sheetInfoOf } from "./list-import.service";
import { analyzeStructure } from "./structure-analyzer";
import { readGrid } from "./grid-reader";

/** Excel con dos hojas: la de más filas es la de clientes, la de productos es "Lista". */
function excel(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Codigo", "Nombre", "Precio", "Stock"],
      ["A1", "Mouse", 10, 3],
      ["A2", "Teclado", 20, 1],
      ["A3", "Monitor", 30, 2],
    ]),
    "Lista"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Nombre", "Telefono", "Mail"], ...Array.from({ length: 8 }, (_, i) => [`Cliente ${i}`, `11${i}`, `c${i}@x.com`])]),
    "Clientes"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const ACTOR = { userId: "u1", isSuperadmin: true, tenant: null };
const PROVIDER = "LIST_TIENDA";

function setup(record: Record<string, unknown>, latestId = "imp1") {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    tenant: { findUnique: jest.fn(async () => ({ id: "sup1", name: "Tienda (local)", active: true })) },
    storefront: { findUnique: jest.fn(async () => null) },
    storedAsset: { findUnique: jest.fn(async () => ({ data: excel() })) },
    supplierListImport: {
      findUnique: jest.fn(async () => record),
      findFirst: jest.fn(async () => ({ id: latestId })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...record, ...data })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "imp2", createdAt: new Date(), ...data };
        created.push(row);
        return row;
      }),
    },
  };
  const registry = { get: jest.fn(() => undefined) };
  const svc = new ListImportService(prisma as never, {} as never, registry as never, {} as never, {} as never, {} as never);
  const processSpy = jest.spyOn(svc, "process").mockResolvedValue(undefined);
  return { svc, prisma, created, processSpy };
}

const BASE_RECORD = {
  id: "imp1",
  provider: PROVIDER,
  level: "BASE",
  tenantId: "sup1",
  storedAssetId: "asset1",
  originalFileName: "stock.xlsx",
  createdAt: new Date(),
};

describe("elegir la hoja de un Excel con varias hojas", () => {
  it("el analizador lee la de más filas, y la vista previa cuenta cuántas hay", () => {
    const analysis = analyzeStructure(readGrid(excel(), "stock.xlsx"));
    expect(analysis.chosen?.sheetName).toBe("Clientes");
    const info = sheetInfoOf({
      sheetCount: 2,
      sheets: analysis.sheets.map((s) => ({ index: s.sheetIndex, name: s.sheetName, dataRows: s.dataRows.length, headerRow: s.headerRow })),
      sheetIndex: analysis.chosen!.sheetIndex,
    });
    expect(info).toEqual({
      count: 2,
      index: 1,
      name: "Clientes",
      dataRows: 8,
      sheets: [
        { index: 0, name: "Lista", dataRows: 3 },
        { index: 1, name: "Clientes", dataRows: 8 },
      ],
    });
    expect(sheetInfoOf(null)).toBeNull();
    expect(sheetInfoOf({ sheets: "roto" })).toBeNull();
  });

  it("una carga en revisión se vuelve a procesar con la hoja elegida", async () => {
    const { svc, prisma, processSpy } = setup({ ...BASE_RECORD, status: "NEEDS_REVIEW" });
    const out = await svc.chooseSheet(ACTOR, PROVIDER, "imp1", 0);
    expect(prisma.supplierListImport.update).toHaveBeenCalledWith({
      where: { id: "imp1" },
      data: { sheetIndex: 0, status: "PROCESSING", error: null },
    });
    expect(out.status).toBe("PROCESSING");
    expect(processSpy).toHaveBeenCalledWith("imp1");
  });

  it("la última carga ya aplicada: entra una carga nueva con el mismo archivo y la otra hoja", async () => {
    const { svc, created, processSpy } = setup({ ...BASE_RECORD, status: "APPLIED" });
    await svc.chooseSheet(ACTOR, PROVIDER, "imp1", 0);
    expect(created[0]).toMatchObject({ storedAssetId: "asset1", sheetIndex: 0, status: "PROCESSING", level: "BASE" });
    expect(processSpy).toHaveBeenCalledWith("imp2");
  });

  it("no se reaplica un archivo viejo, ni una hoja sin tabla, ni mientras procesa", async () => {
    await expect(setup({ ...BASE_RECORD, status: "APPLIED" }, "otra").svc.chooseSheet(ACTOR, PROVIDER, "imp1", 0)).rejects.toThrow(/última carga/);
    await expect(setup({ ...BASE_RECORD, status: "NEEDS_REVIEW" }).svc.chooseSheet(ACTOR, PROVIDER, "imp1", 7)).rejects.toThrow(/no está en el archivo/);
    await expect(setup({ ...BASE_RECORD, status: "PROCESSING" }).svc.chooseSheet(ACTOR, PROVIDER, "imp1", 0)).rejects.toThrow(/Esperá/);
    await expect(setup({ ...BASE_RECORD, provider: "LIST_OTRA", status: "NEEDS_REVIEW" }).svc.chooseSheet(ACTOR, PROVIDER, "imp1", 0)).rejects.toThrow(
      /no encontrada/
    );
  });
});

describe("perfil con la hoja elegida", () => {
  const analysis = analyzeStructure(readGrid(excel(), "stock.xlsx"));
  const active = {
    id: "p1",
    provider: PROVIDER,
    tenantId: "sup1",
    version: 3,
    status: "ACTIVE",
    fingerprint: "huella-vieja",
    headers: ["codigo", "nombre", "precio", "stock"],
    sheetIndex: 1,
    sheetName: "Clientes",
    headerRow: 0,
    columnMap: { Codigo: "externalId", Nombre: "name", Precio: "price", Stock: "stock" },
    currency: null,
    priceIncludesIva: false,
    ivaPercent: null,
    numberFormat: "COMMA",
    dividerMeaning: "IGNORE",
    sampleRows: null,
    proposedByAi: false,
    aiReasoning: null,
    approvedByUserId: "u0",
  };

  function withProfile(profile = active) {
    const tx = {
      importProfile: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        findFirst: jest.fn(async () => ({ version: 3 })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...profile, id: "p2", ...data })),
      },
    };
    const prisma = {
      importProfile: { findFirst: jest.fn(async ({ where }: { where: { status: string } }) => (where.status === "ACTIVE" ? profile : null)) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const svc = new ListImportService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const resolve = (svc as unknown as { resolveProfile: (...a: unknown[]) => Promise<{ profile: { sheetIndex: number }; sheet: { sheetName: string }; match: string }> })
      .resolveProfile.bind(svc);
    return { resolve, tx };
  }

  it("con la hoja elegida, el perfil que sirve la recuerda para las próximas cargas", async () => {
    const { resolve, tx } = withProfile();
    const out = await resolve(PROVIDER, "sup1", analysis, 0);
    expect(out.sheet.sheetName).toBe("Lista");
    expect(out.match).toBe("PARTIAL");
    expect(out.profile.sheetIndex).toBe(0);
    expect(tx.importProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 4, status: "ACTIVE", sheetIndex: 0, sheetName: "Lista", fingerprint: "huella-vieja" }),
    });
  });

  it("sin elección, manda la hoja del perfil (aunque otra tenga más filas) y no se crea nada", async () => {
    const { resolve, tx } = withProfile({ ...active, sheetIndex: 0, sheetName: "Lista" });
    const out = await resolve(PROVIDER, "sup1", analysis, null);
    expect(analysis.chosen?.sheetName).toBe("Clientes");
    expect(out.sheet.sheetName).toBe("Lista");
    expect(tx.importProfile.create).not.toHaveBeenCalled();
  });
});
