import {
  exportUrl,
  fetchSheetCsv,
  fetchSheetWorkbook,
  isAllowedSheetHost,
  parseSheetUrl,
  SheetFetchError,
  SHEET_MAX_BYTES,
  WORKBOOK_MAX_BYTES,
  workbookExportUrl,
} from "./sheet-source";

const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("link de Google Sheets", () => {
  it("toma id y pestaña de los links de compartir", () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toEqual({ sheetId: ID, gid: "0", explicitGid: false });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123456`)).toEqual({ sheetId: ID, gid: "123456", explicitGid: true });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=42#gid=42`)).toEqual({ sheetId: ID, gid: "42", explicitGid: true });
    expect(parseSheetUrl(`  https://docs.google.com/spreadsheets/d/${ID}  `)).toEqual({ sheetId: ID, gid: "0", explicitGid: false });
  });

  it("rechaza lo que no es una planilla de Google", () => {
    for (const bad of [
      "",
      "hola",
      `http://docs.google.com/spreadsheets/d/${ID}/edit`,
      `https://evil.com/spreadsheets/d/${ID}/edit`,
      `https://docs.google.com.evil.com/spreadsheets/d/${ID}/edit`,
      `https://docs.google.com@evil.com/spreadsheets/d/${ID}/edit`,
      `https://docs.google.com/document/d/${ID}/edit`,
      "https://docs.google.com/spreadsheets/d/corto/edit",
      `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1;DROP`,
      `https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pubhtml`,
      `javascript:alert(1)//docs.google.com/spreadsheets/d/${ID}`,
      `file:///etc/passwd`,
    ]) {
      expect(parseSheetUrl(bad)).toHaveProperty("error");
    }
  });

  it("la dirección que se pide la arma NODO", () => {
    expect(exportUrl({ sheetId: ID, gid: "7" })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=7`);
  });

  it("solo hosts de Google", () => {
    expect(isAllowedSheetHost("docs.google.com")).toBe(true);
    expect(isAllowedSheetHost("doc-08-4o-sheets.googleusercontent.com")).toBe(true);
    expect(isAllowedSheetHost("accounts.google.com")).toBe(false);
    expect(isAllowedSheetHost("googleusercontent.com.evil.com")).toBe(false);
    expect(isAllowedSheetHost("evilgoogleusercontent.com")).toBe(false);
    expect(isAllowedSheetHost("169.254.169.254")).toBe(false);
    expect(isAllowedSheetHost("localhost")).toBe(false);
  });
});

/** Respuestas armadas a mano, como las de Google (comprobadas contra una planilla pública real). */
function res(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return new Response(status >= 300 && status < 400 ? null : body, { status, headers });
}

function fakeFetch(steps: Response[]) {
  const calls: string[] = [];
  const impl = jest.fn(async (url: string) => {
    calls.push(url);
    const next = steps.shift();
    if (!next) throw new Error("sin más respuestas");
    return next;
  });
  return { impl, calls };
}

describe("bajar la planilla", () => {
  const ref = { sheetId: ID, gid: "0" };
  const csv = "Codigo,Nombre,Precio\nA1,Mouse,10\n";

  it("sigue la redirección de Google y devuelve el CSV", async () => {
    const { impl, calls } = fakeFetch([
      res(307, { location: "https://doc-08-4o-sheets.googleusercontent.com/export/x/y/z?format=csv&gid=0" }),
      res(200, { "content-type": "text/csv; charset=utf-8" }, csv),
    ]);
    const out = await fetchSheetCsv(ref, impl);
    expect(out.toString("utf8")).toBe(csv);
    expect(calls[0]).toBe(exportUrl(ref));
    expect(calls).toHaveLength(2);
  });

  it("no sigue redirecciones a otros sitios, ni a la red interna, ni a http", async () => {
    for (const location of [
      "https://evil.com/robar",
      "https://169.254.169.254/latest/meta-data",
      "http://doc-08-4o-sheets.googleusercontent.com/export",
      "https://accounts.google.com/ServiceLogin?continue=x",
      "file:///etc/passwd",
    ]) {
      const { impl, calls } = fakeFetch([res(302, { location })]);
      await expect(fetchSheetCsv(ref, impl)).rejects.toThrow(SheetFetchError);
      expect(calls).toHaveLength(1);
    }
  });

  it("una planilla privada, borrada o que no es CSV no entra", async () => {
    for (const r of [
      res(404, { "content-type": "text/html" }, "<html>"),
      res(410, { "content-type": "text/html" }, "<html>"),
      res(401),
      res(200, { "content-type": "text/html; charset=utf-8" }, "<html><script>alert(1)</script>"),
      res(200, { "content-type": "application/javascript" }, "alert(1)"),
    ]) {
      await expect(fetchSheetCsv(ref, fakeFetch([r]).impl)).rejects.toThrow(/Cualquier persona con el enlace/);
    }
  });

  it("pestaña inexistente avisa claro", async () => {
    await expect(fetchSheetCsv(ref, fakeFetch([res(400, { "content-type": "text/html" })]).impl)).rejects.toThrow(/pestaña/);
  });

  it("corta archivos de más de 5 MB, aunque no lo declaren", async () => {
    const big = "x".repeat(SHEET_MAX_BYTES + 10);
    await expect(fetchSheetCsv(ref, fakeFetch([res(200, { "content-type": "text/csv", "content-length": String(big.length) }, big)]).impl)).rejects.toThrow(/5 MB/);
    await expect(fetchSheetCsv(ref, fakeFetch([res(200, { "content-type": "text/csv" }, big)]).impl)).rejects.toThrow(/5 MB/);
  });

  it("no da vueltas infinitas", async () => {
    const loop = Array.from({ length: 10 }, () => res(302, { location: exportUrl(ref) }));
    await expect(fetchSheetCsv(ref, fakeFetch(loop).impl)).rejects.toThrow(/demasiadas veces/);
  });

  it("la planilla entera se pide como xlsx a la dirección que arma NODO", async () => {
    const zip = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(20)]);
    const { impl, calls } = fakeFetch([
      res(307, { location: "https://doc-08-4o-sheets.googleusercontent.com/export/x?format=xlsx" }),
      new Response(zip, { status: 200, headers: { "content-type": XLSX_TYPE } }),
    ]);
    const out = await fetchSheetWorkbook(ID, impl);
    expect(out.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(calls[0]).toBe(workbookExportUrl(ID));
    expect(workbookExportUrl(ID)).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx`);
  });

  it("la planilla entera: lo que no es un xlsx de verdad, no entra", async () => {
    for (const r of [
      res(200, { "content-type": "text/html; charset=utf-8" }, "<html>login</html>"),
      res(200, { "content-type": XLSX_TYPE }, "<html>no es un zip</html>"),
      res(302, { location: "https://accounts.google.com/ServiceLogin" }),
    ]) {
      await expect(fetchSheetWorkbook(ID, fakeFetch([r]).impl)).rejects.toThrow(/Cualquier persona con el enlace/);
    }
  });

  it("la planilla entera tiene su propio tope", async () => {
    const big = "x".repeat(WORKBOOK_MAX_BYTES + 10);
    await expect(fetchSheetWorkbook(ID, fakeFetch([res(200, { "content-type": XLSX_TYPE }, big)]).impl)).rejects.toThrow(/10 MB/);
  });

  it("si Google no responde, corta por tiempo", async () => {
    jest.useFakeTimers();
    const hang = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    );
    const p = fetchSheetCsv(ref, hang);
    jest.advanceTimersByTime(21_000);
    await expect(p).rejects.toThrow(/tardó demasiado/);
    jest.useRealTimers();
  });
});
