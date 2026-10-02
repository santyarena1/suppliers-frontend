import type { AxiosResponse } from "axios";
import {
  isSolutionBoxBadLogin,
  parseSolutionBoxCredentials,
  retryDelayMs,
  withRateLimitRetry,
} from "./solution-box-web-client";
import { mapSolutionBoxArticle, parsePercent } from "./solution-box.parser";

const res = (status: number, headers: Record<string, string> = {}) =>
  ({ status, data: {}, headers }) as unknown as AxiosResponse<unknown>;

describe("Solution Box: login y límites del portal", () => {
  it("solo 401/403 o un 400 que lo dice son credencial incorrecta", () => {
    expect(isSolutionBoxBadLogin(401, {})).toBe(true);
    expect(isSolutionBoxBadLogin(403, {})).toBe(true);
    expect(isSolutionBoxBadLogin(400, { message: "Usuario o contraseña incorrectos" })).toBe(true);
    expect(isSolutionBoxBadLogin(400, { message: "Bad Request" })).toBe(false);
    expect(isSolutionBoxBadLogin(400, {})).toBe(false);
    expect(isSolutionBoxBadLogin(429, {})).toBe(false);
    expect(isSolutionBoxBadLogin(503, {})).toBe(false);
  });

  it("ante 429 reintenta con espera y devuelve la respuesta buena", async () => {
    const send = jest.fn().mockResolvedValueOnce(res(429)).mockResolvedValueOnce(res(429, { "retry-after": "3" })).mockResolvedValueOnce(res(200));
    const waits: number[] = [];
    const out = await withRateLimitRetry(send, [10, 20, 30], async (ms) => void waits.push(ms));
    expect(out.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([10, 3000]);
  });

  it("si sigue limitado, corta después de los reintentos y devuelve el 429", async () => {
    const send = jest.fn().mockResolvedValue(res(429));
    const out = await withRateLimitRetry(send, [1, 1], async () => undefined);
    expect(out.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("acota Retry-After a 60 s", () => {
    expect(retryDelayMs("600", 0, [5])).toBe(60_000);
    expect(retryDelayMs(undefined, 5, [5, 7])).toBe(7);
  });

  it("acepta las credenciales que guardaba el formulario anterior (api_user/api_password)", () => {
    expect(parseSolutionBoxCredentials({ api_user: "a@b.com", api_password: "x" })).toEqual({ email: "a@b.com", password: "x" });
    expect(parseSolutionBoxCredentials({ email: "c@d.com", password: "y", api_user: "otro" })).toEqual({ email: "c@d.com", password: "y" });
  });
});

describe("Solution Box: IVA y moneda por artículo", () => {
  it("lee la alícuota de Tasa_IVA", () => {
    expect(parsePercent("10.5 %")).toBe(10.5);
    expect(parsePercent("21 %")).toBe(21);
    expect(parsePercent("21")).toBe(21);
    expect(parsePercent("")).toBeUndefined();
    expect(parsePercent("abc")).toBeUndefined();
    expect(parsePercent(150)).toBeUndefined();
  });

  it("el artículo trae IVA y respeta pesos o dólares", () => {
    const usd = mapSolutionBoxArticle(
      { Alias: "A1", Nombre: "Fibra", Precio: 12.1, Moneda: "DOLARES", Moneda_Signo: "u$s", Tasa_IVA: "10.5 %", Stock: 5 },
      null
    );
    expect(usd).toMatchObject({ price: 12.1, currency: "USD", ivaPercent: 10.5 });
    const ars = mapSolutionBoxArticle(
      { Alias: "A2", Nombre: "Celular", Precio: 265098, Moneda: "PESOS", Moneda_Signo: "$", Tasa_IVA: "21 %", Stock: 2 },
      null
    );
    expect(ars).toMatchObject({ price: 265098, currency: "ARS", ivaPercent: 21 });
    const sinTasa = mapSolutionBoxArticle({ Alias: "A3", Nombre: "X", Precio: 5, Moneda_Signo: "u$s", Stock: 1 }, null);
    expect(sinTasa?.ivaPercent).toBeUndefined();
  });
});
