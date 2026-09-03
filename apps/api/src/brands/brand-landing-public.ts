/** Recorte público de la landing: nombre + imagen, sin precio, stock, distros ni progreso. */
export function pickPublicLandingModules(input: {
  signals: Array<{ name: string; imageUrl: string | null }>;
  actions: Array<{
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    scopes: Array<{ kind: string }>;
  }>;
  news: Array<{
    id: string;
    publicKey: string;
    title: string;
    excerpt: string;
    coverUrl: string | null;
    publishedAt: Date | null;
  }>;
  resources: Array<{ kind: string; title: string; description: string | null }>;
}) {
  return {
    products: input.signals.slice(0, 24).map((row) => ({
      name: row.name,
      imageUrl: row.imageUrl,
    })),
    actions: input.actions
      .filter((row) => !row.scopes.some((s) => s.kind === "RETAILER" || s.kind === "DISTRIBUTOR"))
      .slice(0, 8)
      .map((row) => ({
        title: row.title,
        description: row.description,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      })),
    news: input.news.slice(0, 8).map((row) => ({
      id: row.id,
      publicKey: row.publicKey,
      title: row.title,
      excerpt: row.excerpt,
      coverUrl: row.coverUrl,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    })),
    materials: input.resources
      .filter((row) => row.kind === "MATERIAL")
      .slice(0, 12)
      .map((row) => ({ title: row.title, description: row.description })),
    trainings: input.resources
      .filter((row) => row.kind === "TRAINING")
      .slice(0, 12)
      .map((row) => ({ title: row.title, description: row.description })),
  };
}
