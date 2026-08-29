import { BadGatewayException, ForbiddenException, NotFoundException } from "@nestjs/common";
import axios from "axios";
import { mapAcuStockStatus, throwAcuStockError, unwrapAcuStock } from "./tgs.errors";

describe("mapAcuStockStatus", () => {
  it("no reenvía 401 para no cerrar la sesión de Nodo", () => {
    expect(mapAcuStockStatus(401)).toBe(502);
  });

  it("conserva 403, 404, 400, 429 y 501", () => {
    expect(mapAcuStockStatus(403)).toBe(403);
    expect(mapAcuStockStatus(404)).toBe(404);
    expect(mapAcuStockStatus(400)).toBe(400);
    expect(mapAcuStockStatus(429)).toBe(429);
    expect(mapAcuStockStatus(501)).toBe(501);
  });

  it("el resto es 502", () => {
    expect(mapAcuStockStatus(500)).toBe(502);
    expect(mapAcuStockStatus(undefined)).toBe(502);
  });
});

describe("unwrapAcuStock", () => {
  it("saca data y meta del envelope", () => {
    expect(unwrapAcuStock({ success: true, data: [{ id: 1 }], meta: { page: 1 } })).toEqual({
      data: [{ id: 1 }],
      meta: { page: 1 },
    });
  });
});

describe("throwAcuStockError", () => {
  it("401 de AcuStock vira a 502 con el mensaje de la API", () => {
    const err = new axios.AxiosError("Unauthorized");
    err.response = {
      status: 401,
      data: { success: false, error: "Credenciales inválidas.", code: "invalid_credentials" },
      statusText: "Unauthorized",
      headers: {},
      config: { headers: {} as never },
    };
    try {
      throwAcuStockError(err);
      throw new Error("debía tirar");
    } catch (e) {
      expect(e).toBeInstanceOf(BadGatewayException);
      expect((e as BadGatewayException).message).toBe("Credenciales inválidas.");
    }
  });

  it("404 conserva not_found", () => {
    const err = new axios.AxiosError("Not Found");
    err.response = {
      status: 404,
      data: { success: false, error: "Producto no encontrado.", code: "not_found" },
      statusText: "Not Found",
      headers: {},
      config: { headers: {} as never },
    };
    expect(() => throwAcuStockError(err)).toThrow(NotFoundException);
  });

  it("403 module_forbidden", () => {
    const err = new axios.AxiosError("Forbidden");
    err.response = {
      status: 403,
      data: { success: false, error: "Módulo prohibido.", code: "module_forbidden" },
      statusText: "Forbidden",
      headers: {},
      config: { headers: {} as never },
    };
    expect(() => throwAcuStockError(err)).toThrow(ForbiddenException);
  });
});
