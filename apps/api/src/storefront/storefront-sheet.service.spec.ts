import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { readGrid } from "../list-import/grid-reader";
import { SheetFetchError } from "./sheet-source";
import { StorefrontSheetService } from "./storefront-sheet.service";

// La ronda programada no corre de 23 a 6 (hora argentina): el test no depende del reloj.
jest.mock("../common/cron-window", () => ({
  ...jest.requireActual("../common/cron-window"),
  shouldRunScheduledJob: () => process.env.CRON_DISABLED !== "true",
}));

const CSV = Buffer.from("Codigo,Nombre,Precio,Stock\nA1,Mouse,10,3\n");
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function setup(store: Record<string, unknown> = {}, lastImportStatus: string | null = null) {
  const sf = {
    id: "sf1",
    retailerTenantId: "ret1",
    sheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    sheetGid: "0" as string | null,
    sheetTab: null as string | null,
    sheetTabs: null as unknown,
    sheetLinkedByUserId: "u1",
    sheetHash: null as string | null,
    sheetError: null as string | null,
    sheetImportId: null as string | null,
    sheetCheckedAt: null as Date | null,
    supplierTenant: { providerKey: "LIST_TGS_LOCAL" },
    ...store,
  };
  const prisma = {
    storefront: {
      findUnique: jest.fn(async () => sf),
      findMany: jest.fn(async () => [{ id: "sf1" }]),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(sf, data)),
    },
    supplierListImport: {
      findUnique: jest.fn(async () => (lastImportStatus ? { status: lastImportStatus } : null)),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    orgNotification: { create: jest.fn(async () => ({})) },
  };
  const imports = { uploadStorefrontSheet: jest.fn(async (_p: string, _u: string, _f: { buffer: Buffer; filename: string }) => ({ id: "imp1" })) };
  const svc = new StorefrontSheetService(prisma as never, imports as never);
  svc.fetcher = jest.fn(async () => CSV);
  svc.workbookFetcher = jest.fn(async () => WORKBOOK);
  return { svc, prisma, imports, sf };
}

/** Planilla con tres pestañas: la de productos no es la primera. */
function workbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
const LISTA = [
  ["Codigo", "Nombre", "Precio", "Stock"],
  ["A1", "Mouse", 10, 3],
  ["A2", "Teclado", 20, 1],
  ["A3", "Monitor", 30, 2],
];
const WORKBOOK = workbook({
  Clientes: [["Nombre", "Telefono"], ["Juan", "11"], ["Ana", "12"]],
  Lista: LISTA,
  Notas: [["Pedir el martes"]],
});

describe("sincronización con Google Sheets", () => {
  const OLD = process.env.CRON_DISABLED;
  afterEach(() => {
    process.env.CRON_DISABLED = OLD;
  });

  it("si cambió, entra como carga de la tienda y guarda la huella", async () => {
    const { svc, imports, sf } = setup();
    const out = await svc.syncOne("sf1");
    expect(out).toEqual({ changed: true, importId: "imp1", error: null });
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledWith("LIST_TGS_LOCAL", "u1", { buffer: CSV, filename: "google-sheets.csv" });
    expect(sf.sheetHash).toBe(hash(CSV));
  });

  it("si no cambió, no procesa nada", async () => {
    const { svc, imports } = setup({ sheetHash: hash(CSV) });
    expect((await svc.syncOne("sf1")).changed).toBe(false);
    expect(imports.uploadStorefrontSheet).not.toHaveBeenCalled();
  });

  it("no apila cargas mientras la anterior está en proceso o en revisión", async () => {
    for (const status of ["PROCESSING", "NEEDS_REVIEW"]) {
      const { svc, imports } = setup({ sheetImportId: "imp0" }, status);
      expect((await svc.syncOne("sf1")).changed).toBe(false);
      expect(imports.uploadStorefrontSheet).not.toHaveBeenCalled();
    }
    const { svc, imports } = setup({ sheetImportId: "imp0" }, "APPLIED");
    expect((await svc.syncOne("sf1")).changed).toBe(true);
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledTimes(1);
  });

  it("un error se guarda y se avisa una sola vez por racha", async () => {
    const { svc, prisma, sf } = setup();
    svc.fetcher = jest.fn(async () => {
      throw new SheetFetchError("No podemos leer la planilla");
    });
    await svc.syncOne("sf1");
    await svc.syncOne("sf1");
    expect(sf.sheetError).toMatch(/No podemos leer/);
    expect(prisma.orgNotification.create).toHaveBeenCalledTimes(1);
  });

  it("dos rondas a la vez: la segunda no arranca", async () => {
    process.env.CRON_DISABLED = "false";
    const { svc } = setup();
    let release: () => void = () => undefined;
    svc.fetcher = jest.fn(() => new Promise<Buffer>((resolve) => (release = () => resolve(CSV))));
    const first = svc.syncAll();
    await new Promise((r) => setImmediate(r));
    await svc.syncAll();
    expect(svc.fetcher).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it("conectar un link que no es de Google no pide nada a internet", async () => {
    const { svc } = setup();
    await expect(svc.link("sf1", "u1", "https://evil.com/x")).rejects.toThrow();
    expect(svc.fetcher).not.toHaveBeenCalled();
    expect(svc.workbookFetcher).not.toHaveBeenCalled();
  });
});

describe("planilla con varias pestañas", () => {
  const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

  it("link sin pestaña: lee la de más productos, la guarda por nombre y la carga sola", async () => {
    const { svc, imports, sf } = setup({ sheetId: null, sheetGid: null, sheetTab: null, sheetTabs: null });
    const out = await svc.link("sf1", "u1", `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`);
    expect(out.changed).toBe(true);
    expect(sf.sheetTab).toBe("Lista");
    expect(svc.fetcher).not.toHaveBeenCalled();
    const [, , file] = imports.uploadStorefrontSheet.mock.calls[0];
    expect(file.filename).toBe("Google Sheets - Lista.xlsx");
    const sheets = readGrid(file.buffer, file.filename);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows[1]).toEqual(["A1", "Mouse", 10, 3]);
    const view = StorefrontSheetService.view({ ...sf, sheetCheckedAt: null, sheetChangedAt: null } as never)!;
    expect(view.tab).toBe("Lista");
    expect(view.tabSource).toBe("MOST_ROWS");
    expect(view.tabs.map((t) => t.name)).toEqual(["Clientes", "Lista", "Notas"]);
  });

  it("link con pestaña (#gid): lee esa por gid y reconoce cómo se llama", async () => {
    const { svc, imports, sf } = setup({ sheetId: null, sheetGid: null, sheetTab: null, sheetTabs: null });
    const csv = Buffer.from("Codigo,Nombre,Precio,Stock\nA1,Mouse,10,3\nA2,Teclado,20,1\nA3,Monitor,30,2\n");
    svc.fetcher = jest.fn(async () => csv);
    await svc.link("sf1", "u1", `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=777`);
    expect(svc.fetcher).toHaveBeenCalledWith({ sheetId: ID, gid: "777", explicitGid: true });
    expect(sf.sheetTab).toBeNull();
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledWith("LIST_TGS_LOCAL", "u1", { buffer: csv, filename: "google-sheets.csv" });
    const view = StorefrontSheetService.view({ ...sf, sheetCheckedAt: null, sheetChangedAt: null } as never)!;
    expect(view.tabSource).toBe("LINK");
    expect(view.tab).toBe("Lista");
  });

  it("elegir otra pestaña: se guarda, descarta la revisión de la anterior y se lee en el momento", async () => {
    const { svc, prisma, imports, sf } = setup({ sheetTab: null, sheetImportId: "imp0" });
    // La carga anterior quedó en revisión; al elegir pestaña se descarta y deja de frenar.
    prisma.supplierListImport.findUnique.mockImplementation(async () => null);
    const out = await svc.chooseTab("sf1", "Clientes");
    expect(prisma.supplierListImport.updateMany).toHaveBeenCalledWith({
      where: { id: "imp0", status: "NEEDS_REVIEW" },
      data: expect.objectContaining({ status: "DISCARDED" }),
    });
    expect(sf.sheetTab).toBe("Clientes");
    expect(out.changed).toBe(true);
    expect(imports.uploadStorefrontSheet.mock.calls[0][2].filename).toBe("Google Sheets - Clientes.xlsx");
    expect(StorefrontSheetService.view({ ...sf, sheetCheckedAt: null, sheetChangedAt: null } as never)!.tabSource).toBe("CHOSEN");
  });

  it("elegir una pestaña que no existe no cambia nada", async () => {
    const { svc, sf } = setup({ sheetTab: "Lista" });
    await expect(svc.chooseTab("sf1", "Stock 2023")).rejects.toThrow(/La pestaña «Stock 2023» ya no está en la planilla/);
    expect(sf.sheetTab).toBe("Lista");
  });

  it("si la pestaña elegida desaparece, queda el error claro y se avisa una vez", async () => {
    const { svc, prisma, imports, sf } = setup({ sheetTab: "Stock viejo" });
    const out = await svc.syncOne("sf1");
    expect(out.error).toMatch(/La pestaña «Stock viejo» ya no está en la planilla/);
    expect(sf.sheetError).toMatch(/Stock viejo/);
    expect(imports.uploadStorefrontSheet).not.toHaveBeenCalled();
    await svc.syncOne("sf1");
    expect(prisma.orgNotification.create).toHaveBeenCalledTimes(1);
    // Igual se guardan las pestañas que sí hay, para elegir otra.
    expect(StorefrontSheetService.view({ ...sf, sheetCheckedAt: null, sheetChangedAt: null } as never)!.tabs).toHaveLength(3);
  });

  it("pestaña elegida sin cambios: no se carga de nuevo", async () => {
    const { svc, imports } = setup({ sheetTab: "Lista" });
    await svc.syncOne("sf1");
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledTimes(1);
    await svc.syncOne("sf1");
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledTimes(1);
  });

  it("tienda vinculada antes (solo gid): sigue leyendo esa pestaña como CSV", async () => {
    const { svc, imports } = setup({ sheetGid: "123", sheetTab: null, sheetTabs: null });
    await svc.syncOne("sf1");
    expect(svc.fetcher).toHaveBeenCalledWith({ sheetId: expect.any(String), gid: "123" });
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledWith("LIST_TGS_LOCAL", "u1", { buffer: CSV, filename: "google-sheets.csv" });
  });

  it("si no se puede bajar la planilla entera, la pestaña del link se sigue leyendo", async () => {
    const { svc, imports } = setup({ sheetTab: null, sheetTabs: null });
    svc.workbookFetcher = jest.fn(async () => {
      throw new SheetFetchError("Google tardó demasiado en responder.");
    });
    const out = await svc.syncOne("sf1");
    expect(out).toEqual({ changed: true, importId: "imp1", error: null });
    expect(imports.uploadStorefrontSheet).toHaveBeenCalledTimes(1);
  });
});
