/**
 * El superadmin de prueba opera el Comercio de Pruebas: mismas credenciales
 * de proveedor y misma visibilidad que testuser1, sin "entrar como", y sin
 * perder el árbol de administración.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-superadmin-demo.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEMO_USER = process.env.DEMO_USER ?? "testuser1";

function decode(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

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

function dataOf(res) {
  return res.payload?.data ?? res.payload;
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando visibilidad del superadmin en ${API_URL}\n`);

  const adminLogin = await call("POST", "/auth/login", null, {
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
  });
  const adminToken = dataOf(adminLogin)?.token;
  check("El superadmin entra", Boolean(adminToken), `HTTP ${adminLogin.status}`);
  if (!adminToken) throw new Error("No se pudo entrar como superadmin");

  const claims = decode(adminToken);
  check("Sigue siendo administrador de plataforma", claims.role === "ROLE_ADMIN", claims.role);
  check("El token trae el Comercio de Pruebas",
    claims.tenantName === "Comercio de Pruebas" && claims.tenantType === "RETAILER" && claims.tenantRole === "ADMIN",
    claims.tenantName ? `${claims.tenantRole} en ${claims.tenantName}` : "sin organización");

  const arbol = await call("GET", "/admin/tenants", adminToken);
  check("Sigue viendo el árbol de organizaciones", arbol.status === 200,
    `${(dataOf(arbol)?.tenants ?? []).length} organizaciones`);

  const demo = (dataOf(arbol)?.tenants ?? []).find((t) => t.name === "Comercio de Pruebas");
  if (!demo) throw new Error("No está el Comercio de Pruebas. Corré scripts/seed-demo-tenants.mjs");
  const testuser = demo.members.find((m) => m.username === DEMO_USER || m.username === "testuser");
  if (!testuser) throw new Error(`No está ${DEMO_USER} en el Comercio de Pruebas`);

  const impersonation = await call("POST", `/admin/users/${testuser.userId}/impersonate`, adminToken);
  const testToken = dataOf(impersonation)?.token;
  check("Puede entrar como testuser1 si hace falta", Boolean(testToken), `HTTP ${impersonation.status}`);
  if (!testToken) throw new Error("No se pudo entrar como testuser1");

  const credsAdmin = await call("GET", "/credentials/me", adminToken);
  const credsTest = await call("GET", "/credentials/me", testToken);
  check("El superadmin lee las credenciales del comercio", credsAdmin.status === 200,
    `HTTP ${credsAdmin.status}`);
  const fingerprint = (res) =>
    (Array.isArray(dataOf(res)) ? dataOf(res) : [])
      .map((c) => `${c.providerName}:${c.credentialsJson}`)
      .sort()
      .join("|");
  check("Ve las mismas credenciales que testuser1", fingerprint(credsAdmin) === fingerprint(credsTest),
    `admin=${fingerprint(credsAdmin) ? fingerprint(credsAdmin).split("|").length : 0} · testuser=${fingerprint(credsTest) ? fingerprint(credsTest).split("|").length : 0}`);

  const visAdmin = await call("GET", "/my/providers", adminToken);
  const visTest = await call("GET", "/my/providers", testToken);
  const names = (res) =>
    (Array.isArray(dataOf(res)) ? dataOf(res) : [])
      .map((p) => p.provider)
      .sort()
      .join(",");
  check("Ve los mismos proveedores que testuser1", visAdmin.status === 200 && names(visAdmin) === names(visTest),
    `admin=[${names(visAdmin)}] · testuser=[${names(visTest)}]`);

  const cartFp = (res) =>
    (Array.isArray(dataOf(res)) ? dataOf(res) : [])
      .map((item) => `${item.provider}:${item.externalId}:${item.quantity}`)
      .sort()
      .join("|");
  const cartAdmin = await call("GET", "/cart", adminToken);
  const cartTest = await call("GET", "/cart", testToken);
  check("Comparte el carrito del comercio",
    cartAdmin.status === 200 && cartTest.status === 200 && cartFp(cartAdmin) === cartFp(cartTest),
    `HTTP ${cartAdmin.status} / ${cartTest.status}`);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
