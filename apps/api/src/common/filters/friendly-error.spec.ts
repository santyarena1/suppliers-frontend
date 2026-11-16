import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { friendlyError, friendlyErrorMessage } from "@nodo/shared";
import { HttpExceptionFilter } from "./http-exception.filter";

/** Errores reales de los logs de producción. */
describe("friendlyError", () => {
  it("New Bytes: envío que tardó (el de la mañana del 16/11)", () => {
    const r = friendlyError(
      "No se pudo cotizar el envío en NewBytes: NewBytes GET carrito/calcularEnvioPara/1408/43371 falló: timeout of 30000ms exceeded"
    );
    expect(r.message).toBe(
      "No se pudo cotizar el envío en New Bytes: New Bytes tardó demasiado en responder (más de 30 segundos). Suele ser algo momentáneo de su sistema: probá de nuevo en unos minutos."
    );
    expect(r.technical).toContain("timeout of 30000ms exceeded");
  });

  it("timeout suelto, con el proveedor de la pantalla", () => {
    expect(friendlyErrorMessage("timeout of 20000ms exceeded", { provider: "Invid" })).toMatch(/^Invid tardó demasiado en responder \(más de 20 segundos\)/);
    expect(friendlyErrorMessage("timeout of 20000ms exceeded")).toMatch(/^El proveedor tardó demasiado/);
  });

  it("403 de una sincronización", () => {
    expect(friendlyErrorMessage("Auto-sync GRUPO_NUCLEO falló: Request failed with status code 403")).toBe(
      "Auto-sync Grupo Núcleo falló: Grupo Núcleo rechazó el acceso (error 403). Puede que haya cambiado tu clave o que tu cuenta no tenga permiso para esto."
    );
  });

  it("conexión caída", () => {
    expect(friendlyErrorMessage("Upstream error: connect ETIMEDOUT 64.190.27.41:8096", { provider: "Distecna" })).toMatch(/^No pudimos conectarnos con Distecna/);
    expect(friendlyErrorMessage("getaddrinfo ENOTFOUND api.elit.com.ar")).toMatch(/^No pudimos encontrar el sistema de Elit/);
    expect(friendlyErrorMessage("Auto-sync POLYTECH falló: The operation was aborted due to timeout")).toMatch(/Polytech tardó demasiado/);
  });

  it("lo que dijo el proveedor en un 400 se muestra; un 5xx se explica", () => {
    expect(friendlyErrorMessage('NewBytes POST carrito/add → 400: {"message":"No hay stock suficiente"}')).toBe("New Bytes respondió: «No hay stock suficiente».");
    expect(friendlyErrorMessage("NewBytes POST carrito/add → 503: <html>Service Unavailable</html>")).toMatch(/^New Bytes tuvo un error en su sistema \(error 503\)/);
    expect(friendlyErrorMessage("Invid GET pedidos → 401: no autorizado")).toMatch(/^Invid no aceptó el usuario o la clave/);
    expect(friendlyErrorMessage("Elit GET x/y → 429: slow down")).toMatch(/demasiados pedidos/);
  });

  it("sin conexión", () => {
    expect(friendlyErrorMessage("No se pudo iniciar sesión en NewBytes: Network Error")).toBe(
      "No se pudo iniciar sesión en New Bytes: no hay conexión con New Bytes. Revisá tu internet y probá de nuevo."
    );
  });

  it("los mensajes ya escritos para el comercio no cambian", () => {
    for (const m of ["Usuario o clave de NewBytes incorrectos", "Elegí un medio de pago de NewBytes", "Subí el certificado de AFIP", "Error 503 de Elit"]) {
      expect(friendlyError(m)).toEqual({ message: m, technical: null });
    }
  });

  it("aplicarlo dos veces no cambia nada", () => {
    for (const raw of [
      "Seguimiento INVID de 12ce: timeout of 20000ms exceeded",
      "La AIR no responde: socket hang up",
      "No se pudo vaciar el carrito de Invid después de cotizar: AxiosError: timeout of 20000ms exceeded",
    ]) {
      const once = friendlyErrorMessage(raw);
      expect(once).not.toMatch(/timeout of|AxiosError|socket hang up/);
      expect(friendlyErrorMessage(once)).toBe(once);
    }
  });
});

describe("HttpExceptionFilter con errores de proveedores", () => {
  function run(exception: unknown) {
    const sent: { status?: number; body?: Record<string, unknown> } = {};
    const reply = {
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: Record<string, unknown>) {
        sent.body = body;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => reply, getRequest: () => ({ method: "GET", url: "/x" }) }),
    };
    new HttpExceptionFilter().catch(exception, host as never);
    return sent;
  }

  it("un BadGateway técnico sale explicado y guarda el original", () => {
    const r = run(new BadGatewayException("NewBytes GET carrito falló: timeout of 30000ms exceeded"));
    expect(r.status).toBe(502);
    expect(r.body?.message).toMatch(/^New Bytes tardó demasiado en responder/);
    expect((r.body?.details as { technical?: string }).technical).toContain("timeout of 30000ms");
  });

  it("un timeout sin envolver ya no es «Error interno del servidor»", () => {
    const r = run(new Error("timeout of 20000ms exceeded"));
    expect(r.status).toBe(504);
    expect(r.body?.message).toMatch(/tardó demasiado en responder/);
  });

  it("los mensajes normales pasan igual", () => {
    const r = run(new BadRequestException("Elegí un medio de pago de NewBytes"));
    expect(r.body).toEqual({ success: false, message: "Elegí un medio de pago de NewBytes" });
    expect(run(new Error("algo raro")).body?.message).toBe("Error interno del servidor");
  });
});

describe("espejo de la web", () => {
  it("apps/web/lib/friendlyError.ts es la misma lógica que @nodo/shared", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.resolve(__dirname, "../../../../..");
    const body = (file: string) =>
      fs
        .readFileSync(path.join(root, file), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/^[\s\S]*?import \{ PROVIDER_LABELS \} from "[^"]+";\n/, "");
    expect(body("apps/web/lib/friendlyError.ts")).toBe(body("packages/shared/src/friendly-error.ts"));
  });
});
