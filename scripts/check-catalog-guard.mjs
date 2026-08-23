/**
 * Verifica que solo un administrador pueda vaciar el catálogo de un proveedor.
 *
 * `ProviderSyncCache` es una tabla compartida por toda la plataforma: hasta que el
 * catálogo esté separado por organización, borrarlo afecta a todos los comercios.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-catalog-guard.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET = process.env.TARGET_USERNAME ?? "tecnostore.vendedor";
const PROVIDER = process.env.PROVIDER ?? "CEVEN";

async function call(method, path, token) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "POST" ? { body: "{}" } : {}),
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
  console.log(`Verificando ${API_URL}\n`);

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
  });
  const adminToken = (await res.json()).data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const users = (await call("GET", "/admin/users", adminToken)).payload.data;
  const target = users.find((u) => u.username === TARGET);
  if (!target) throw new Error(`No existe el usuario ${TARGET}`);
  const userToken = (await call("POST", `/admin/users/${target.id}/impersonate`, adminToken)).payload.data.token;

  const clear = await call("POST", `/providers/${PROVIDER}/clear-zero-stock`, userToken);
  check("Un usuario común no puede limpiar el catálogo", clear.status === 403, `HTTP ${clear.status}`);

  const wipe = await call("DELETE", `/providers/${PROVIDER}/products`, userToken);
  check("Un usuario común no puede borrar el catálogo", wipe.status === 403, `HTTP ${wipe.status}`);

  const search = await call("GET", `/search/provider/${PROVIDER}?name=a`, userToken);
  check("Un usuario común sí puede buscar", search.status === 200, `HTTP ${search.status}`);

  // El lado positivo solo se prueba si no hay nada que perder: el endpoint borra de
  // verdad, y este script no puede vaciar un catálogo real por accidente.
  const status = await call("GET", `/providers/${PROVIDER}/status`, adminToken);
  const stored = status.payload.data?.productsInDb ?? status.payload.data?.total ?? null;
  if (stored === 0) {
    const asAdmin = await call("POST", `/providers/${PROVIDER}/clear-zero-stock`, adminToken);
    check("El administrador sí puede", asAdmin.status === 200 || asAdmin.status === 201, `HTTP ${asAdmin.status}`);
  } else {
    console.log(`·    El administrador sí puede — sin probar: ${PROVIDER} tiene ${stored ?? "?"} productos y el endpoint borra de verdad`);
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
