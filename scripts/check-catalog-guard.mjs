/**
 * Verifica que vaciar el catálogo de un proveedor no sea cosa de cualquiera.
 *
 * Desde que el catálogo está separado por organización el borrado ya no afecta a
 * toda la plataforma, pero sigue dejando sin catálogo al comercio entero: es del
 * dueño, no de un vendedor.
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
  check("Un vendedor no puede limpiar el catálogo de su comercio", clear.status === 403, `HTTP ${clear.status}`);

  const wipe = await call("DELETE", `/providers/${PROVIDER}/products`, userToken);
  check("Un vendedor no puede borrar el catálogo de su comercio", wipe.status === 403, `HTTP ${wipe.status}`);

  const search = await call("GET", `/search/provider/${PROVIDER}?name=a`, userToken);
  check("Un vendedor sí puede buscar", search.status === 200, `HTTP ${search.status}`);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
