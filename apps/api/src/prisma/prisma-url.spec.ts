import { withPrismaPool } from "./prisma-url";

describe("withPrismaPool", () => {
  const prev = process.env.PRISMA_CONNECTION_LIMIT;

  afterEach(() => {
    if (prev == null) delete process.env.PRISMA_CONNECTION_LIMIT;
    else process.env.PRISMA_CONNECTION_LIMIT = prev;
  });

  it("agrega connection_limit y pool_timeout si faltan", () => {
    delete process.env.PRISMA_CONNECTION_LIMIT;
    expect(withPrismaPool("postgresql://u:p@localhost:5432/db")).toBe(
      "postgresql://u:p@localhost:5432/db?connection_limit=8&pool_timeout=20"
    );
  });

  it("conserva query existente y no pisa un limit ya puesto", () => {
    delete process.env.PRISMA_CONNECTION_LIMIT;
    expect(withPrismaPool("postgresql://u:p@h/db?schema=public&connection_limit=3")).toBe(
      "postgresql://u:p@h/db?schema=public&connection_limit=3&pool_timeout=20"
    );
  });
});
