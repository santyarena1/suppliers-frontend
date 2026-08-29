import { TgsService } from "./tgs.service";
import type { TgsClient } from "./tgs.client";

describe("TgsService", () => {
  it("normaliza listados al contrato de Nodo { items, meta }", async () => {
    const client = {
      get: jest.fn().mockResolvedValue({
        data: [{ id: 1 }],
        meta: { page: 2, per_page: 20, total: 40, total_pages: 2, local_id: 1 },
      }),
    };
    const service = new TgsService(client as unknown as TgsClient);
    await expect(service.list("/stock")).resolves.toEqual({
      items: [{ id: 1 }],
      meta: { page: 2, per_page: 20, total: 40, total_pages: 2, local_id: 1 },
    });
  });

  it("si data no es array, devuelve lista vacía", async () => {
    const client = {
      get: jest.fn().mockResolvedValue({ data: null }),
    };
    const service = new TgsService(client as unknown as TgsClient);
    const res = await service.list("/rma");
    expect(res.items).toEqual([]);
    expect(res.meta.page).toBe(1);
  });
});
