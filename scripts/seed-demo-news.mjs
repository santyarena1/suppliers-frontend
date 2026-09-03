/**
 * Publica notas de muestra en New Bytes, Elit, Asus y Gigabyte.
 * Idempotente: si el título ya existe en esa org, no la duplica.
 *
 * Uso:
 *   API_URL=... ADMIN_PASSWORD=... node scripts/seed-demo-news.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-production-f4aa.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123";

const NOTES = [
  {
    author: "New Bytes",
    username: "newbytes.gerente",
    title: "Llegaron las RTX 50: hay para armar",
    excerpt: "El lote ya está en depósito. Pedí con tu vendedor; el stock se mueve rápido.",
    kind: "INCOMING",
    isPublic: true,
    coverUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=1600&q=80",
    bodyHtml: `<style>
  .nota { font-family: "Source Serif 4", Georgia, serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 8px 0 28px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
  .nota h2 { font-size: 24px; line-height: 1.25; font-weight: 600; margin: 1.4em 0 0.5em; }
</style>
<div class="nota">
  <p>Entró el primer contenedor de GeForce RTX 50. Hay 4070, 5070 y 5080 para armar combo con mother y fuente.</p>
  <h2>Cómo pedirlo</h2>
  <p>Escribile a tu vendedor o armá el carrito en NODO. Si el SKU no aparece, todavía no lo sincronizamos: lo cargamos en el día.</p>
</div>`,
  },
  {
    author: "New Bytes",
    username: "newbytes.gerente",
    title: "Lista de precios · septiembre",
    excerpt: "Vigente hasta fin de mes. El Excel queda adentro de NODO, solo para cuentas vinculadas.",
    kind: "PRICE_LIST",
    isPublic: false,
    coverUrl: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1600&q=80",
    bodyHtml: `<style>
  .nota { font-family: "Source Serif 4", Georgia, serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 8px 0 28px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
</style>
<div class="nota">
  <p>Actualizamos la lista de septiembre. Los precios del feed ya están alineados; el archivo es el respaldo para cotizar afuera.</p>
  <p>Si ves un desfasaje entre la ficha y el Excel, gana la ficha. Avisanos y lo corregimos.</p>
</div>`,
    attachments: [{ kind: "LINK", title: "Lista septiembre (portal)", contentUrl: "https://www.newbytes.com.ar", visibility: "IN_APP" }],
  },
  {
    author: "Elit",
    username: "elit.gerente",
    title: "Septiembre: 30/60 en notebooks y monitores",
    excerpt: "Vigente sobre el pedido cerrado este mes. No aplica a liquidación.",
    kind: "PROMO",
    isPublic: true,
    coverUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
    bodyHtml: `<style>
  .nota { font-family: "Source Serif 4", Georgia, serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 8px 0 28px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
  .nota ul { font-size: 18px; line-height: 1.65; padding-left: 1.2em; }
</style>
<div class="nota">
  <p>Para pedidos de notebooks y monitores que cierren en septiembre:</p>
  <ul>
    <li>30/60 sobre el total neto, sin recargo.</li>
    <li>Tope por cuenta: el que ya tienen informado.</li>
    <li>No entra liquidación ni outlet.</li>
  </ul>
  <p>Si necesitan una excepción, háblenlo con el vendedor antes de armar el carrito.</p>
</div>`,
  },
  {
    author: "Elit",
    username: "elit.gerente",
    title: "Depósito: nuevo corte de salida a las 15:30",
    excerpt: "A partir del lunes. Lo que entre después viaja al día siguiente.",
    kind: "NOTICE",
    isPublic: false,
    coverUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1600&q=80",
    bodyHtml: `<style>
  .nota { font-family: "Source Serif 4", Georgia, serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 8px 0 28px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
</style>
<div class="nota">
  <p>El depósito corta la preparación a las 15:30. Los pedidos confirmados después de esa hora salen al día hábil siguiente.</p>
  <p>No cambia el horario de atención comercial. Solo la ventana de picking.</p>
</div>`,
  },
  {
    author: "Asus",
    username: "asus.admin",
    title: "ROG Strix OLED: ya está en el canal",
    excerpt: "27 y 32 pulgadas. Precio sugerido y material de góndola, en esta nota.",
    kind: "LAUNCH",
    isPublic: true,
    coverUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1600&q=80",
    bodyHtml: `<style>
  .nota { font-family: "Source Serif 4", Georgia, serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 8px 0 28px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
  .nota h2 { font-size: 24px; line-height: 1.25; font-weight: 600; margin: 1.4em 0 0.5em; }
</style>
<div class="nota">
  <p>Arranca la familia ROG Strix OLED. Hay dos tamaños: 27 y 32. El 27 es el que más van a pedir; el 32 queda para gamer y creador.</p>
  <h2>Canal</h2>
  <p>El stock está en New Bytes. Si no lo ves en el buscador, pedí el código a tu vendedor: a veces tarda un día en sincronizar.</p>
</div>`,
  },
  {
    author: "Gigabyte",
    username: "gigabyte.admin",
    title: "B850: qué mother conviene según el Ryzen",
    excerpt: "Una guía corta para no mezclar chipset y cooler en el mostrador.",
    kind: "CATALOG",
    isPublic: true,
    coverUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80",
    bodyHtml: `<style>
  .nota { font-family: "Source Serif 4", Georgia, serif; color: #161616; max-width: 680px; margin: 0 auto; padding: 8px 0 28px; }
  .nota p { font-size: 18px; line-height: 1.7; margin: 0 0 1.1em; }
  .nota h2 { font-size: 24px; line-height: 1.25; font-weight: 600; margin: 1.4em 0 0.5em; }
</style>
<div class="nota">
  <p>Para AM5, B850 cubre el 90% de lo que se vende en el local. No hace falta empujar X870 si el cliente arma un 7600 o un 8700G.</p>
  <h2>Regla rápida</h2>
  <p>7600 / 7600X → B850 Eagle. 9700X o más → B850 Aorus. Si piden Wi-Fi, el SKU lo dice en el nombre: no improvisen un adaptador.</p>
</div>`,
  },
];

async function call(method, path, token, body) {
  const sinCuerpo = method === "GET" || method === "DELETE";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(sinCuerpo ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(sinCuerpo ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

async function main() {
  console.log(`Autenticando como ${ADMIN_USER} en ${API_URL}`);
  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error(login.payload.message ?? "No se pudo entrar como administrador");

  const users = (await call("GET", "/admin/users", adminToken)).payload.data ?? [];
  const byUsername = new Map(users.map((user) => [user.username, user]));

  let created = 0;
  let skipped = 0;

  for (const note of NOTES) {
    const user = byUsername.get(note.username);
    if (!user) {
      console.log(`! ${note.author}: no está ${note.username}`);
      continue;
    }
    const session = await call("POST", `/admin/users/${user.id}/impersonate`, adminToken, {});
    const token = session.payload.data?.token;
    if (!token) {
      console.log(`! No se pudo entrar como ${note.username}`);
      continue;
    }

    const mine = await call("GET", "/my/news", token);
    const items = mine.payload.data?.items ?? [];
    if (items.some((item) => item.title === note.title)) {
      console.log(`= ${note.author}: ${note.title}`);
      skipped += 1;
      continue;
    }

    const saved = await call("POST", "/my/news", token, {
      title: note.title,
      excerpt: note.excerpt,
      bodyHtml: note.bodyHtml,
      coverUrl: note.coverUrl,
      kind: note.kind,
      status: "PUBLISHED",
      isPublic: note.isPublic,
      notifyOnPublish: false,
      attachments: note.attachments ?? [],
    });
    if (saved.status >= 400 || saved.payload.success === false) {
      console.log(`! ${note.author}: ${note.title} → ${saved.payload.message ?? saved.status}`);
      continue;
    }
    created += 1;
    console.log(`+ ${note.author}: ${note.title}`);
  }

  console.log(`\nListo. ${created} nuevas, ${skipped} ya estaban.`);
}

main().catch((err) => {
  console.error("Falló el seed:", err.message);
  process.exit(1);
});
