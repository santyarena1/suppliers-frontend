/**
 * Aislamiento del módulo Noticias.
 *
 * Distro B no ve notas de Distro A. Una marca no ve notas de otra marca.
 * El comercio sin vínculo no ve a A salvo campaña activa. La lista de precios
 * no sale en la pública ni al comercio solo-publicitado.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-news-visibility.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
  return { status: res.status, payload: await res.json().catch(() => ({})) };
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push(ok);
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function memberUserId(tenant) {
  return tenant?.members?.[0]?.userId;
}

async function publishNote(token, title) {
  return call("POST", "/my/news", token, {
    title,
    excerpt: "Verificación de aislamiento",
    bodyHtml: "<p>Cuerpo de prueba.</p>",
    coverUrl: "https://example.com/cover.jpg",
    kind: "NOTICE",
    status: "PUBLISHED",
    isPublic: true,
    attachments: [
      { kind: "PRICE_LIST", title: "Lista de prueba", fileUrl: "https://example.com/lista.xlsx", visibility: "IN_APP" },
      { kind: "FILE", title: "Foto pública", fileUrl: "https://example.com/foto.jpg", visibility: "PUBLIC" },
    ],
  });
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando noticias en ${API_URL}\n`);

  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const tree = (await call("GET", "/admin/tenants", adminToken)).payload.data;
  const tenants = tree.tenants ?? tree;
  const distros = tenants.filter((t) => t.type === "DISTRIBUTOR" && memberUserId(t));
  const marcas = tenants.filter((t) => t.type === "BRAND" && memberUserId(t));
  const comercios = tenants.filter(
    (t) => t.type === "RETAILER" && memberUserId(t) && t.name !== "Administración" && !t.mirrorsCommercialFromId
  );

  if (distros.length < 2) throw new Error("Hacen falta dos distribuidores con personas");
  if (comercios.length < 1) throw new Error("Hace falta un comercio con personas");

  const distroA = distros[0];
  const distroB = distros[1];
  const marcaA =
    marcas.find((m) => (distroA.suppliers ?? []).some((l) => l.tenant?.id === m.id || l.supplierTenantId === m.id)) ??
    marcas[0];
  const marcaB = marcas.find((m) => m.id !== marcaA?.id);
  const comercioVinculado =
    comercios.find((c) => (c.suppliers ?? []).some((l) => l.tenant?.id === distroA.id || l.supplierTenantId === distroA.id)) ??
    null;
  const comercioAjeno =
    comercios.find((c) => !(c.suppliers ?? []).some((l) => l.tenant?.id === distroA.id || l.supplierTenantId === distroA.id)) ??
    comercios.find((c) => c.id !== comercioVinculado?.id);

  const sesion = async (userId) =>
    (await call("POST", `/admin/users/${userId}/impersonate`, adminToken)).payload.data?.token;

  const tokenA = await sesion(memberUserId(distroA));
  const tokenB = await sesion(memberUserId(distroB));
  if (!tokenA || !tokenB) throw new Error("No se pudo suplantar a los distribuidores");

  const created = [];
  const notaA = await publishNote(tokenA, `[check] Distro A ${Date.now()}`);
  check("Distro A puede publicar", notaA.status === 201 || notaA.status === 200, `HTTP ${notaA.status}`);
  const idA = notaA.payload.data?.id;
  const keyA = notaA.payload.data?.publicKey;
  if (idA) created.push({ id: idA, token: tokenA });

  if (!idA) {
    console.log("No se pudo crear la nota de A; el resto de checks no aplica.");
  } else {
    const feedB = await call("GET", "/news", tokenB);
    const itemsB = feedB.payload.data?.items ?? [];
    check("Distro B no ve la nota de Distro A en el feed", !itemsB.some((n) => n.id === idA), `${itemsB.length} notas`);

    const fichaB = await call("GET", `/news/${idA}`, tokenB);
    check("Distro B pide la ficha y recibe 404", fichaB.status === 404, `HTTP ${fichaB.status}`);

    if (comercioVinculado) {
      const tokenC = await sesion(memberUserId(comercioVinculado));
      const feedC = await call("GET", "/news", tokenC);
      const itemsC = feedC.payload.data?.items ?? [];
      check("El comercio vinculado ve la nota de A", itemsC.some((n) => n.id === idA));
      const fichaC = await call("GET", `/news/${idA}`, tokenC);
      const atts = fichaC.payload.data?.attachments ?? [];
      check("El comercio vinculado puede bajar la lista", atts.some((a) => a.kind === "PRICE_LIST"));
    } else {
      console.log("(No hay comercio vinculado a Distro A; se omite ese check)");
    }

    if (comercioAjeno) {
      const tokenX = await sesion(memberUserId(comercioAjeno));
      const feedX = await call("GET", "/news", tokenX);
      const itemsX = feedX.payload.data?.items ?? [];
      check("El comercio sin vínculo no ve a A (sin campaña)", !itemsX.some((n) => n.id === idA));
      const fichaX = await call("GET", `/news/${idA}`, tokenX);
      check("Ese comercio recibe 404, no 403", fichaX.status === 404, `HTTP ${fichaX.status}`);
    }

    const publica = await call("GET", `/public/news/${keyA}`, null);
    check("La pública existe si isPublic", publica.status === 200, `HTTP ${publica.status}`);
    const attsPub = publica.payload.data?.attachments ?? [];
    check("La lista de precios no viaja en la pública", !attsPub.some((a) => a.kind === "PRICE_LIST"));
    check("Un archivo PUBLIC sí puede viajar", attsPub.some((a) => a.visibility === "PUBLIC"));
  }

  if (marcaA && marcaB) {
    const tokenMa = await sesion(memberUserId(marcaA));
    const tokenMb = await sesion(memberUserId(marcaB));
    const notaM = await publishNote(tokenMa, `[check] Marca A ${Date.now()}`);
    const idM = notaM.payload.data?.id;
    if (idM) {
      created.push({ id: idM, token: tokenMa });
      const feedMb = await call("GET", "/news", tokenMb);
      const itemsMb = feedMb.payload.data?.items ?? [];
      check("Marca B no ve la nota de Marca A", !itemsMb.some((n) => n.id === idM));
      const fichaMb = await call("GET", `/news/${idM}`, tokenMb);
      check("Marca B recibe 404 al pedirla", fichaMb.status === 404, `HTTP ${fichaMb.status}`);
    }
  }

  const inventada = await call("GET", "/public/news/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", null);
  check("Una publicKey inventada es 404", inventada.status === 404, `HTTP ${inventada.status}`);

  for (const row of created) {
    await call("DELETE", `/my/news/${row.id}`, row.token);
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
