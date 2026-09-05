import { buildEnvelope, decodeXml, extractFault, extractResult, parseNewTreeApiCredentials } from "./new-tree-soap-client";
import { mapApiArticle, stockFromSemaphore } from "./new-tree-catalog.parser";

describe("new-tree soap client", () => {
  const creds = { username: "usPrimero", password: "us<1>&3", company: 18, webService: 1000 };

  it("parses API credentials with aliases and rejects incomplete ones", () => {
    expect(parseNewTreeApiCredentials({ api_username: "u", api_password: "p", company: "18", webservice: "1000", client_id: "15" }))
      .toEqual({ username: "u", password: "p", company: 18, webService: 1000, clientId: 15 });
    expect(parseNewTreeApiCredentials({ username: "portal", password: "x" })).toBeNull();
    expect(parseNewTreeApiCredentials({ api_username: "u", api_password: "p", company: "18", webservice: "1000" })).toBeNull();
  });

  it("builds the SOAP envelope with header, token and escaped values", () => {
    const xml = buildEnvelope("wsGBPScriptExecute", creds, "tok-1", {
      strScriptLabel: "getArticulos",
      strJSonParameters: '{"client_id":15}',
    });
    expect(xml).toContain('<wsERPConnectHeader xmlns="http://tempuri.org/">');
    expect(xml).toContain("<pPassword>us&lt;1&gt;&amp;3</pPassword>");
    expect(xml).toContain("<pCompany>18</pCompany><pWebWervice>1000</pWebWervice>");
    expect(xml).toContain("<pAuthenticatedToken>tok-1</pAuthenticatedToken>");
    expect(xml).toContain("<strJSonParameters>{&quot;client_id&quot;:15}</strJSonParameters>");
    expect(buildEnvelope("AuthenticateUser", creds, null)).not.toContain("pAuthenticatedToken");
  });

  it("extracts results and faults from SOAP responses", () => {
    const ok = `<soap:Envelope><soap:Body><wsGBPScriptExecuteResponse xmlns="http://tempuri.org/"><wsGBPScriptExecuteResult>[{&quot;id&quot;:1,&quot;title&quot;:&quot;A &amp; B&quot;}]</wsGBPScriptExecuteResult></wsGBPScriptExecuteResponse></soap:Body></soap:Envelope>`;
    expect(extractResult(ok, "wsGBPScriptExecute")).toBe('[{"id":1,"title":"A & B"}]');
    expect(extractResult("<x/>", "wsGBPScriptExecute")).toBeNull();
    expect(extractFault(`<soap:Fault><faultstring>Server was unable\n to process</faultstring></soap:Fault>`)).toBe("Server was unable to process");
    expect(decodeXml("&#233;")).toBe("é");
  });

  it("maps API articles to normalized products", () => {
    const item = mapApiArticle({
      id: 123,
      title: "PELOTA FUTBOL Nº5 DRB TEAM",
      currency_symbol: "ARS",
      price: 445.4313,
      iva: 21,
      part_number: "99999",
      brand: "SIN MARCA",
      description: "",
      stock_semaphore: "ALTO",
      category_id: 99,
      category: "Periféricos",
      image_url: "https://img/1.jpg",
      height: 2, width: 2, length: 4, volume: 16, weight: 1,
      dimensions_unit: "cm",
      weight_unit: "gr",
    });
    expect(item).toMatchObject({
      externalId: "123",
      partNumber: "99999",
      brand: undefined,
      category: "Periféricos",
      price: 445.4313,
      finalPrice: 538.9719,
      currency: "ARS",
      ivaPercent: 21,
      stockStatus: "ALTO",
      weightUnit: "gr",
    });
    expect(item?.stock).toBeUndefined();
    expect(mapApiArticle({ id: "", title: "x" })).toBeNull();
    expect(stockFromSemaphore("SIN STOCK")).toEqual({ stock: 0, stockStatus: "SIN STOCK" });
    expect(stockFromSemaphore(0)).toEqual({ stock: 0, stockStatus: "0" });
    expect(stockFromSemaphore("BAJO")).toEqual({ stockStatus: "BAJO" });
  });
});
