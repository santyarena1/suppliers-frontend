import { authorIdsForViewer } from "./news-visibility";

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
