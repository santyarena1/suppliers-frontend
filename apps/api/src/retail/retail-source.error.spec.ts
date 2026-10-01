import {
  RetailSourceUnavailableError,
  describeRetailSourceError,
  isRetailSourceUnavailable,
} from "./retail-source.error";

describe("describeRetailSourceError", () => {
  it("reconoce el certificado ajeno de mlsgrid", () => {
    const err = Object.assign(
      new Error(
        "Hostname/IP does not match certificate's altnames: Host: api.preciolider.com.ar is not in the cert's altnames: DNS:*.mlsgrid.com, DNS:mlsgrid.com"
      ),
      { code: "ERR_TLS_CERT_ALTNAME_INVALID" }
    );
    const d = describeRetailSourceError(err);
    expect(d.unavailable).toBe(true);
    expect(d.message).toContain("PrecioLíder");
    expect(d.message).toContain("mlsgrid.com");
    expect(d.message).not.toMatch(/Hostname\/IP/);
    expect(isRetailSourceUnavailable(err)).toBe(true);
  });

  it("reconoce un 503 del load balancer", () => {
    const err = Object.assign(new Error("Request failed with status code 503"), {
      response: { status: 503 },
    });
    const d = describeRetailSourceError(err);
    expect(d.unavailable).toBe(true);
    expect(d.message).toContain("503");
  });

  it("reconoce timeouts y DNS", () => {
    expect(describeRetailSourceError(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })).unavailable).toBe(true);
    expect(describeRetailSourceError(Object.assign(new Error("not found"), { code: "ENOTFOUND" })).unavailable).toBe(true);
  });

  it("no marca como caída un 401 o un 500 de negocio", () => {
    const unauthorized = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401 },
    });
    expect(describeRetailSourceError(unauthorized).unavailable).toBe(false);

    const boom = Object.assign(new Error("Request failed with status code 500"), {
      response: { status: 500 },
    });
    expect(describeRetailSourceError(boom).unavailable).toBe(false);
    expect(describeRetailSourceError(boom).message).toContain("500");
  });

  it("propaga RetailSourceUnavailableError", () => {
    const err = new RetailSourceUnavailableError("fuente caída");
    expect(isRetailSourceUnavailable(err)).toBe(true);
    expect(describeRetailSourceError(err).message).toBe("fuente caída");
  });
});
