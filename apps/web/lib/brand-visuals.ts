/** URLs de imagen para armar el hero / mosaico de una marca. */
export function collectBrandVisuals(opts: {
  heroUrl?: string | null;
  products?: Array<{ imageUrl?: string | null }>;
  news?: Array<{ coverUrl?: string | null }>;
  materials?: Array<{ type?: string; fileUrl?: string | null; contentUrl?: string | null }>;
}): string[] {
  const urls: string[] = [];
  const add = (u?: string | null) => {
    const v = (u ?? "").trim();
    if (v && !urls.includes(v)) urls.push(v);
  };
  add(opts.heroUrl);
  for (const p of opts.products ?? []) add(p.imageUrl);
  for (const n of opts.news ?? []) add(n.coverUrl);
  for (const m of opts.materials ?? []) {
    if (isVisualAsset(m.type, m.fileUrl || m.contentUrl)) add(m.fileUrl || m.contentUrl);
  }
  return urls;
}

export function isVisualAsset(type?: string | null, url?: string | null): boolean {
  const t = (type ?? "").toUpperCase();
  if (t === "IMAGE" || t === "BANNER") return true;
  return /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(url ?? "");
}

export function brandHtmlCoversModule(
  slots: string[] | undefined,
  module: "products" | "actions" | "news" | "materials" | "trainings"
): boolean {
  const s = new Set((slots ?? []).map((x) => x.toLowerCase()));
  if (module === "products") return s.has("productos") || s.has("semaforos");
  if (module === "actions") return s.has("acciones");
  if (module === "news") return s.has("noticias") || s.has("novedades");
  if (module === "materials") return s.has("materiales");
  return s.has("capacitaciones");
}

/** Plantilla HTML con todos los huecos: el diseño envuelve los módulos nativos. */
export const BRAND_LANDING_HTML_TEMPLATE = `<style>
  .nodo-land { max-width: 1100px; margin: 0 auto; padding: 28px 20px 48px; color: #0f172a; }
  .nodo-land nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
  .nodo-land nav a {
    color: inherit; text-decoration: none; font: 600 12px/1.2 system-ui, sans-serif;
    letter-spacing: .06em; text-transform: uppercase; padding: 8px 14px;
    border: 1px solid #cbd5e1; border-radius: 999px;
  }
  .nodo-land h2 { font: 700 22px/1.2 system-ui, sans-serif; margin: 36px 0 12px; }
  .nodo-land .lead { font: 400 15px/1.5 system-ui, sans-serif; color: #475569; max-width: 40rem; }
</style>
<section class="nodo-land">
  <nav>
    <a href="#productos">Productos</a>
    <a href="#acciones">Acciones</a>
    <a href="#novedades">Novedades</a>
    <a href="#materiales">Materiales</a>
    <a href="#capacitaciones">Capacitaciones</a>
    <a href="#contacto">Contacto</a>
  </nav>
  <p class="lead">{{nombre}}</p>
  <h2>Productos</h2>
  {{productos}}
  <h2>Acciones</h2>
  {{acciones}}
  <h2>Novedades</h2>
  {{novedades}}
  <h2>Materiales</h2>
  {{materiales}}
  <h2>Capacitaciones</h2>
  {{capacitaciones}}
</section>
`;
