import { INestApplication } from "@nestjs/common";
import { NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "15m";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "a".repeat(64);
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test";

describe("GET /health", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn(), onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await (app as unknown as INestApplication).getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns success: true with status ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({ success: true, data: { status: "ok", uptime: expect.any(Number) } });
  });
});
