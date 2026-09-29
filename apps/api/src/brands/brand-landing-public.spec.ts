import { pickPublicLandingModules } from "./brand-landing-public";

describe("pickPublicLandingModules", () => {
  const day = new Date("2026-09-01T12:00:00.000Z");

  it("muestra nombre e imagen, sin filtrar por distro", () => {
    const out = pickPublicLandingModules({
      signals: [
        { name: "Aorus 15", imageUrl: "https://img.test/a.jpg" },
        { name: "B550", imageUrl: null },
      ],
      actions: [],
      news: [],
      resources: [],
    });
    expect(out.products).toEqual([
      { name: "Aorus 15", imageUrl: "https://img.test/a.jpg" },
      { name: "B550", imageUrl: null },
    ]);
  });

  it("oculta acciones dirigidas a un comercio o distro concreto", () => {
    const out = pickPublicLandingModules({
      signals: [],
      actions: [
        {
          title: "Rebate general",
          description: "Para todos",
          startsAt: day,
          endsAt: day,
          scopes: [{ kind: "PRODUCT" }],
        },
        {
          title: "Solo un local",
          description: "secreto",
          startsAt: day,
          endsAt: day,
          scopes: [{ kind: "RETAILER" }],
        },
        {
          title: "Solo un distro",
          description: "secreto",
          startsAt: day,
          endsAt: day,
          scopes: [{ kind: "DISTRIBUTOR" }],
        },
      ],
      news: [],
      resources: [],
    });
    expect(out.actions.map((a) => a.title)).toEqual(["Rebate general"]);
    expect(out.actions[0]).not.toHaveProperty("progress");
  });

  it("materiales públicos con enlace; los de solo vinculados sin enlace", () => {
    const out = pickPublicLandingModules({
      signals: [],
      actions: [],
      news: [
        {
          id: "n1",
          publicKey: "abc",
          title: "Lanzamiento",
          excerpt: "Nuevo",
          coverUrl: "https://img.test/cover.jpg",
          publishedAt: day,
        },
      ],
      resources: [
        { kind: "MATERIAL", type: "PDF", title: "Catálogo", description: "PDF", fileUrl: "/assets/cat.pdf", isPublic: true },
        { kind: "MATERIAL", type: "PRICE_LIST", title: "Lista", description: null, fileUrl: "/assets/l.xlsx", isPublic: false },
        { kind: "TRAINING", type: "VIDEO", title: "Curso", description: null, contentUrl: "https://video.test/x" },
      ],
    });
    expect(out.news[0]).toMatchObject({ publicKey: "abc", coverUrl: "https://img.test/cover.jpg" });
    expect(out.materials).toEqual([
      { title: "Catálogo", description: "PDF", type: "PDF", fileUrl: "/assets/cat.pdf", contentUrl: null, restricted: false },
      { title: "Lista", description: null, type: "PRICE_LIST", fileUrl: null, contentUrl: null, restricted: true },
    ]);
    expect(out.trainings[0]).toMatchObject({ title: "Curso", contentUrl: "https://video.test/x", restricted: false });
  });
});
