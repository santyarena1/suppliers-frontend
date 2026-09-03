import { authorIdsForViewer, visibleNewsAttachments } from "./news-visibility";

const set = {
  ownId: "me",
  linkedSupplierIds: ["brand-a", "distro-a"],
  linkedClientDistributorIds: ["distro-a"],
  advertisedAuthorIds: ["distro-b", "brand-b"],
};

describe("authorIdsForViewer", () => {
  it("el comercio ve vinculados y anunciantes", () => {
    const ids = authorIdsForViewer("RETAILER", set);
    expect(ids.sort()).toEqual(["brand-a", "brand-b", "distro-a", "distro-b"]);
  });

  it("el distro no ve a otro distro aunque pague publicidad", () => {
    const ids = authorIdsForViewer("DISTRIBUTOR", set);
    expect(ids).toEqual(["me", "brand-a", "distro-a"]);
    expect(ids).not.toContain("distro-b");
  });

  it("la marca no ve a otra marca aunque pague publicidad", () => {
    const ids = authorIdsForViewer("BRAND", set);
    expect(ids).toEqual(["me", "distro-a"]);
    expect(ids).not.toContain("brand-b");
  });
});

const files = [
  { kind: "PRICE_LIST", visibility: "IN_APP", title: "lista" },
  { kind: "FILE", visibility: "IN_APP", title: "interno" },
  { kind: "FILE", visibility: "PUBLIC", title: "foto" },
];

describe("visibleNewsAttachments", () => {
  it("en la pública solo viajan los PUBLIC", () => {
    expect(visibleNewsAttachments(files, { linked: false, publicView: true }).map((f) => f.title)).toEqual(["foto"]);
  });

  it("un comercio solo-publicitado no baja la lista", () => {
    expect(visibleNewsAttachments(files, { linked: false }).map((f) => f.title)).toEqual(["foto"]);
  });

  it("con vínculo ve la lista y los archivos internos", () => {
    expect(visibleNewsAttachments(files, { linked: true }).map((f) => f.title)).toEqual([
      "lista",
      "interno",
      "foto",
    ]);
  });
});
