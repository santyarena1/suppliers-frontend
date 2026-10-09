import { RunsService } from "./runs.service";
import { PipelineBudget } from "./pipeline.service";

function setup(opts: { cancelAfter?: number; costPerItem?: number } = {}) {
  let processed = 0;
  const saved: Record<string, unknown>[] = [];
  const prisma = {
    enrichmentRun: {
      create: jest.fn().mockResolvedValue({ id: "r1" }),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        saved.push(data);
        return Promise.resolve({ id: "r1", ...data });
      }),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve({ cancelRequested: opts.cancelAfter !== undefined && processed >= opts.cancelAfter })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    catalogMaster: { findMany: jest.fn() },
  };
  const aiCalls: boolean[] = [];
  const pipeline = {
    enrichMaster: jest.fn().mockImplementation(async (id: string, { budget }: { budget: PipelineBudget }) => {
      const canSpend = budget.canSpend();
      aiCalls.push(canSpend);
      if (canSpend) budget.onAiCall(opts.costPerItem ?? 0);
      processed++;
      if (id === "boom") throw new Error("falló");
      return { masterId: id, proposals: 2, aiCalls: canSpend ? 1 : 0, costUsd: 0, sources: {}, notes: [] };
    }),
  };
  return { service: new RunsService(prisma as never, pipeline as never), prisma, pipeline, saved, aiCalls };
}

describe("corridas en segundo plano", () => {
  it("procesa todo, cuenta propuestas y fallas", async () => {
    const { service, saved } = setup();
    const ids = ["a", "b", "boom", "c"];
    const final = await service.execute("r1", ids, 1);
    expect(final).toMatchObject({ status: "DONE", processed: 4, failed: 1, proposals: 6 });
    expect(saved.at(-1)?.finishedAt).toBeInstanceOf(Date);
  });

  it("al llegar al tope de costo sigue sin IA", async () => {
    const { service, aiCalls } = setup({ costPerItem: 0.4 });
    const final = await service.execute("r1", ["a", "b", "c", "d", "e", "f"], 1);
    expect(final).toMatchObject({ status: "DONE", processed: 6 });
    expect(aiCalls.filter(Boolean).length).toBeLessThan(6);
    expect((final as { estCostUsd: number }).estCostUsd).toBeLessThanOrEqual(1 + 0.4 * 3);
  });

  it("cancelar corta la corrida", async () => {
    const { service } = setup({ cancelAfter: 5 });
    const ids = Array.from({ length: 40 }, (_, i) => `m${i}`);
    const final = await service.execute("r1", ids, 1);
    expect(final).toMatchObject({ status: "CANCELLED" });
    expect((final as { processed: number }).processed).toBeLessThan(40);
  });

  it("no arranca dos corridas a la vez", async () => {
    const { service, prisma } = setup();
    prisma.catalogMaster.findMany.mockResolvedValue([{ id: "a" }]);
    let release: () => void = () => undefined;
    jest.spyOn(service, "execute").mockImplementation(() => new Promise((r) => (release = () => r({} as never))));
    await service.start({ kind: "filter", maxItems: 1, maxCostUsd: 1 }, "u1");
    await expect(service.start({ kind: "filter", maxItems: 1, maxCostUsd: 1 }, "u1")).rejects.toThrow("Ya hay una corrida");
    release();
  });
});
