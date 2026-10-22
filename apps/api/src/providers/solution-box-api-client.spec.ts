import { BadRequestException } from "@nestjs/common";
import {
  SolutionBoxApiClient,
  clearSolutionBoxApiTokenCache,
  extractSolutionBoxApiArticles,
  hasSolutionBoxOfficialApi,
  parseSolutionBoxApiCredentials,
  type HttpResponseLike,
  type SolutionBoxHttp,
} from "./solution-box-api-client";

const CREDS = { sb_api_user: "acme", sb_api_password: "secreto" };
const ARTICLES = [{ Alias: "SB1", Descripcion: "Mouse" }];

/** HTTP armado: cada llamada consume la próxima respuesta de su ruta. */
function fakeHttp(routes: { token?: HttpResponseLike[]; list?: HttpResponseLike[] }) {
  const calls: { method: string; url: string; auth: string }[] = [];
  const http: SolutionBoxHttp = async (req) => {
    calls.push({ method: req.method, url: req.url, auth: req.headers.Authorization });
    const queue = req.url.endsWith("/api/usuario/createToken") ? routes.token : routes.list;
    const next = queue?.shift();
    if (!next) throw new Error(`llamada no esperada: ${req.method} ${req.url}`);
    return next;
  };
  return { http, calls };
}

beforeEach(() => clearSolutionBoxApiTokenCache());

describe("credenciales de la API oficial", () => {
  it("usa sb_api_user/sb_api_password y no confunde el mail del portal", () => {
    expect(parseSolutionBoxApiCredentials(CREDS)).toEqual({ user: "acme", password: "secreto" });
    expect(hasSolutionBoxOfficialApi({ email: "a@b.com", password: "x" })).toBe(false);
    expect(hasSolutionBoxOfficialApi({ api_user: "a@b.com", api_password: "x" })).toBe(false);
    expect(hasSolutionBoxOfficialApi({ sb_api_user: "acme", sb_api_password: " " })).toBe(false);
    expect(hasSolutionBoxOfficialApi({ ...CREDS, email: "a@b.com", password: "x" })).toBe(true);
  });
});

describe("extractSolutionBoxApiArticles", () => {
  it("acepta el array pelado o envuelto", () => {
    expect(extractSolutionBoxApiArticles(ARTICLES)).toEqual(ARTICLES);
    expect(extractSolutionBoxApiArticles({ Articulos: ARTICLES })).toEqual(ARTICLES);
    expect(extractSolutionBoxApiArticles({ data: { articulos: ARTICLES } })).toEqual(ARTICLES);
    expect(extractSolutionBoxApiArticles({ mensaje: "nada" })).toEqual([]);
    expect(extractSolutionBoxApiArticles([1, null, { Alias: "X" }])).toEqual([{ Alias: "X" }]);
  });
});

describe("SolutionBoxApiClient", () => {
  it("pide token con Basic y lista con Bearer", async () => {
    const { http, calls } = fakeHttp({
      token: [{ status: 201, data: { token: "T1", expira_en: 604800 } }],
      list: [{ status: 200, data: ARTICLES }],
    });
    const rows = await SolutionBoxApiClient.fromCredentials(CREDS, http).listArticles();
    expect(rows).toEqual(ARTICLES);
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);
    expect(calls[0].auth).toBe(`Basic ${Buffer.from("acme:secreto").toString("base64")}`);
    expect(calls[1].auth).toBe("Bearer T1");
  });

  it("la sync siguiente reusa el token guardado: un solo GET", async () => {
    const first = fakeHttp({ token: [{ status: 200, data: { token: "T1" } }], list: [{ status: 200, data: ARTICLES }] });
    await SolutionBoxApiClient.fromCredentials(CREDS, first.http).listArticles();
    const second = fakeHttp({ list: [{ status: 200, data: ARTICLES }] });
    await SolutionBoxApiClient.fromCredentials(CREDS, second.http).listArticles();
    expect(second.calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("un 401 del listado renueva el token una vez", async () => {
    const { http, calls } = fakeHttp({
      token: [{ status: 201, data: { token: "T1" } }, { status: 201, data: { token: "T2" } }],
      list: [{ status: 401, data: {} }, { status: 200, data: ARTICLES }],
    });
    await expect(SolutionBoxApiClient.fromCredentials(CREDS, http).listArticles()).resolves.toEqual(ARTICLES);
    expect(calls.map((c) => c.auth.split(" ")[0])).toEqual(["Basic", "Bearer", "Basic", "Bearer"]);
    expect(calls[3].auth).toBe("Bearer T2");
  });

  it("un 429 del listado corta sin reintentar y lo dice", async () => {
    const { http, calls } = fakeHttp({
      token: [{ status: 201, data: { token: "T1" } }],
      list: [{ status: 429, data: { mensaje: "Too many" } }],
    });
    await expect(SolutionBoxApiClient.fromCredentials(CREDS, http).listArticles()).rejects.toThrow(/429.*2 por hora/);
    expect(calls).toHaveLength(2);
  });

  it("429 en createToken: reusa el token que todavía no venció, aunque esté por vencer", async () => {
    let now = 1_000_000;
    const first = fakeHttp({ token: [{ status: 201, data: { token: "T1", expira_en: 600 } }], list: [{ status: 200, data: ARTICLES }] });
    await SolutionBoxApiClient.fromCredentials(CREDS, first.http, () => now).listArticles();
    now += 400_000; // quedan 200 s: dentro del margen de 5 min, se intenta renovar
    const second = fakeHttp({ token: [{ status: 429, data: {} }], list: [{ status: 200, data: ARTICLES }] });
    await SolutionBoxApiClient.fromCredentials(CREDS, second.http, () => now).listArticles();
    expect(second.calls.map((c) => c.auth)).toEqual([expect.stringMatching(/^Basic /), "Bearer T1"]);
  });

  it("429 en createToken sin token guardado: corta con el límite en el mensaje", async () => {
    const { http } = fakeHttp({ token: [{ status: 429, data: {} }] });
    await expect(SolutionBoxApiClient.fromCredentials(CREDS, http).listArticles()).rejects.toThrow(/429.*10 minutos/);
  });

  it("usuario o contraseña de la API mal: error de credenciales", async () => {
    const { http } = fakeHttp({ token: [{ status: 401, data: { mensaje: "Usuario inválido" } }] });
    const err = await SolutionBoxApiClient.fromCredentials(CREDS, http).listArticles().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/contraseña de la API/);
  });

  it("sin usuario y contraseña de la API no se arma el cliente", () => {
    expect(() => SolutionBoxApiClient.fromCredentials({ email: "a@b.com", password: "x" })).toThrow(BadRequestException);
  });
});
