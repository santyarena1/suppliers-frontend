import { createHash } from "node:crypto";
import { SheetFetchError } from "./sheet-source";
import { StorefrontSheetService } from "./storefront-sheet.service";

const CSV = Buffer.from("Codigo,Nombre,Precio,Stock\nA1,Mouse,10,3\n");
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function setup(store: Record<string, unknown> = {}, lastImportStatus: string | null = null) {
  const sf = {
    id: "sf1",
    retailerTenantId: "ret1",
    sheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    sheetGid: "0",
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
    supplierListImport: { findUnique: jest.fn(async () => (lastImportStatus ? { status: lastImportStatus } : null)) },
    orgNotification: { create: jest.fn(async () => ({})) },
  };
  const imports = { uploadStorefrontSheet: jest.fn(async () => ({ id: "imp1" })) };
  const svc = new StorefrontSheetService(prisma as never, imports as never);
  svc.fetcher = jest.fn(async () => CSV);
  return { svc, prisma, imports, sf };
}

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
  });
});
