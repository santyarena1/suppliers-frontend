import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";

/**
 * Arma el grafo de dependencias completo sin levantar el servidor ni tocar la base.
 *
 * Un guard o un servicio usado en un módulo que no importa al módulo que lo provee
 * compila perfecto y recién revienta al arrancar. Esta prueba lo saca a la luz acá
 * en vez de en el primer despliegue.
 */
describe("AppModule", () => {
  const env = { ...process.env };

  beforeAll(() => {
    // Valores mínimos para que la configuración valide; nadie se conecta a nada.
    process.env.DATABASE_URL ??= "postgresql://usuario:clave@localhost:5432/nodo";
    process.env.JWT_SECRET ??= "secreto-de-prueba";
    process.env.ENCRYPTION_KEY ??= "0".repeat(64);
  });

  afterAll(() => {
    process.env = env;
  });

  it("resuelve todas las dependencias", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.close();
  });
});
