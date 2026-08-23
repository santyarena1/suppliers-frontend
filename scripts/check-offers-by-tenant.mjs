/**
 * Verifica la fase 3 del plan de aislamiento: el precio y el stock son de cada
 * comercio, y la ficha del producto es de todos.
 *
 * Sincroniza un proveedor de catálogo público como una organización y comprueba
 * que solo esa organización vea los productos, que el markup se aplique al leer
 * (cambiarlo se ve al instante, sin resincronizar) y que vaciar el catálogo no sea
 * cosa de cualquiera.
 *
 * Las sesiones se obtienen con "entrar como", así que no hace falta saber ninguna
 * contraseña más que la del superadmin.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-offers-by-tenant.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Catálogo público: se puede sincronizar sin tener cuenta en el proveedor.
const PROVIDER = process.env.PROVIDER ?? "CEVEN";
const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT_MS ?? 10 * 60_000);

async function call(method, path, token, body) {
  const sinCuerpo = method === "GET" || method === "DELETE";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(sinCuerpo ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(sinCuerpo ? {} : { body: JSON.stringify(body ?? {}) }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
  });
  return { status: res.status, payload: await res.json().catch(() => ({})) };
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push(ok);
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando ${API_URL} con ${PROVIDER}\n`);

  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const tree = (await call("GET", "/admin/tenants", adminToken)).payload.data;
  const tenants = (tree.tenants ?? tree).filter((t) => (t.members ?? []).length > 0);

  const dueño = (t) => t.members.find((m) => m.tenantRole === "OWNER") ?? t.members[0];
  const conDueño = tenants.find((t) => dueño(t));
  if (!conDueño) throw new Error("No hay ninguna organización con personas para probar");
  const otra = tenants.find((t) => t.id !== conDueño.id);
  if (!otra) throw new Error("Hace falta una segunda organización para probar el aislamiento");

  console.log(`Organización que sincroniza: ${conDueño.name}`);
  console.log(`Organización ajena: ${otra.name}\n`);

  const sesion = async (userId) =>
    (await call("POST", `/admin/users/${userId}/impersonate`, adminToken)).payload.data?.token;

  const tokenPropio = await sesion(dueño(conDueño).userId);
  const tokenAjeno = await sesion(dueño(otra).userId);

  await call("PUT", `/providers/${PROVIDER}/config`, tokenPropio, { priceMarkupPercent: 0 });

  const yaTiene = (await call("GET", `/providers/${PROVIDER}/status`, tokenPropio)).payload.data;
  if (!yaTiene?.total) {
    console.log("Sincronizando (puede tardar varios minutos)...");
    const sync = await call("POST", `/providers/${PROVIDER}/sync`, tokenPropio);
    check("La sincronización termina bien", sync.status === 200 || sync.status === 201, `HTTP ${sync.status}`);
  } else {
    console.log(`La organización ya tenía ${yaTiene.total} productos, no se resincroniza.\n`);
  }

  const estadoPropio = (await call("GET", `/providers/${PROVIDER}/status`, tokenPropio)).payload.data;
  check("La organización que sincronizó tiene catálogo", (estadoPropio?.total ?? 0) > 0,
    `${estadoPropio?.total} productos`);

  const estadoAjeno = (await call("GET", `/providers/${PROVIDER}/status`, tokenAjeno)).payload.data;
  check(`${otra.name} sigue sin catálogo de ${PROVIDER}`, (estadoAjeno?.total ?? 0) === 0,
    `${estadoAjeno?.total} productos`);

  // Un término cualquiera que casi seguro aparezca en cualquier catálogo de tecnología.
  const termino = process.env.TERMINO ?? "a";
  const propios = (await call("GET", `/search/provider/${PROVIDER}?name=${termino}`, tokenPropio)).payload;
  const resultados = Array.isArray(propios.data) ? propios.data : propios;
  check("La búsqueda devuelve los productos de la organización", resultados.length > 0,
    `${resultados.length} resultados`);

  const ajenos = (await call("GET", `/search/provider/${PROVIDER}?name=${termino}`, tokenAjeno)).payload;
  const resultadosAjenos = Array.isArray(ajenos.data) ? ajenos.data : ajenos;
  check("La misma búsqueda no devuelve nada para la otra organización", resultadosAjenos.length === 0,
    `${resultadosAjenos.length} resultados`);

  const conPrecio = resultados.find((p) => Number(p.price) > 0);
  if (!conPrecio) throw new Error("El catálogo sincronizado no trajo ningún producto con precio");

  const ruta = `/providers/${PROVIDER}/products/${encodeURIComponent(conPrecio.externalId)}`;
  const crudo = Number((await call("GET", ruta, tokenPropio)).payload.data.price);

  try {
    await call("PUT", `/providers/${PROVIDER}/config`, tokenPropio, { priceMarkupPercent: 10 });
    const conMarkup = Number((await call("GET", ruta, tokenPropio)).payload.data.price);
    const esperado = Math.round(crudo * 1.1 * 100) / 100;
    check("El markup se aplica al leer, sin resincronizar", Math.abs(conMarkup - esperado) < 0.02,
      `${crudo} → ${conMarkup} (esperado ${esperado})`);

    const sinTocarElOtro = await call("GET", ruta, tokenAjeno);
    check("El markup de una organización no le llega a la otra", sinTocarElOtro.status === 404,
      `HTTP ${sinTocarElOtro.status}`);
  } finally {
    await call("PUT", `/providers/${PROVIDER}/config`, tokenPropio, { priceMarkupPercent: 0 });
  }

  const vuelve = Number((await call("GET", ruta, tokenPropio)).payload.data.price);
  check("Volver el markup a cero recupera el precio original", Math.abs(vuelve - crudo) < 0.02,
    `${vuelve} vs ${crudo}`);

  // El superadmin no pertenece a ninguna organización: no tiene catálogo, pero
  // tampoco tiene que romperse.
  const busquedaAdmin = await call("GET", `/search/provider/${PROVIDER}?name=${termino}`, adminToken);
  const vacio = Array.isArray(busquedaAdmin.payload.data) ? busquedaAdmin.payload.data : busquedaAdmin.payload;
  check("El superadmin ve el catálogo vacío en vez de un error",
    busquedaAdmin.status === 200 && vacio.length === 0, `HTTP ${busquedaAdmin.status}, ${vacio.length} resultados`);

  const destacados = await call("GET", "/catalog/featured", adminToken);
  check("Los destacados tampoco fallan para el superadmin", destacados.status === 200, `HTTP ${destacados.status}`);

  const vendedor = conDueño.members.find((m) => m.tenantRole === "SELLER" || m.tenantRole === "VIEWER");
  if (vendedor) {
    const tokenVendedor = await sesion(vendedor.userId);
    const intento = await call("DELETE", `/providers/${PROVIDER}/products`, tokenVendedor);
    check(`Un ${vendedor.tenantRole.toLowerCase()} no puede vaciar el catálogo`, intento.status === 403,
      `HTTP ${intento.status}`);
  } else {
    console.log("(No hay vendedor en esa organización, se omite la prueba de permisos de borrado)");
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
