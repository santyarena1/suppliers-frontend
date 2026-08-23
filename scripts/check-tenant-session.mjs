/**
 * Verifica la fase 1 del plan de aislamiento: la sesión sabe a qué organización
 * pertenece quien la usa.
 *
 * Comprueba que el token de una persona traiga su organización y su rol adentro,
 * que el del superadmin no traiga ninguna (es transversal a propósito), que la
 * suplantación herede la organización del suplantado, y que no quede nadie sin
 * organización salvo los administradores.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-tenant-session.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEMO_USER = process.env.DEMO_USER ?? "tecnostore.vendedor";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "password123";

function decode(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

async function login(username, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!body.data?.token) throw new Error(`No se pudo entrar como ${username}: ${body.message ?? res.status}`);
  return body.data.token;
}

async function get(path, token) {
  const res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return (await res.json()).data;
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push(ok);
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando ${API_URL}\n`);

  const adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  const adminClaims = decode(adminToken);
  check("El superadmin no pertenece a ninguna organización", !adminClaims.tenantId,
    adminClaims.tenantName ?? "sin organización");

  const userToken = await login(DEMO_USER, DEMO_PASSWORD);
  const userClaims = decode(userToken);
  check("La sesión de una persona trae su organización", Boolean(userClaims.tenantId),
    userClaims.tenantName ?? "ninguna");
  check("La sesión trae el rol dentro de la organización", Boolean(userClaims.tenantRole),
    `${userClaims.tenantRole ?? "ninguno"} en ${userClaims.tenantType ?? "?"}`);

  const users = await get("/admin/users", adminToken);
  const target = users.find((u) => u.username === DEMO_USER);
  const impersonated = await fetch(`${API_URL}/admin/users/${target.id}/impersonate`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    body: "{}",
  });
  const session = (await impersonated.json()).data;
  const impersonatedClaims = decode(session.token);
  check("Al entrar como alguien se hereda su organización", impersonatedClaims.tenantId === userClaims.tenantId,
    impersonatedClaims.tenantName ?? "ninguna");
  check("La respuesta de suplantación informa la organización", session.user.tenantName === userClaims.tenantName,
    session.user.tenantName ?? "ninguna");

  // Nadie puede quedar sin organización salvo los administradores.
  const tree = await get("/admin/tenants", adminToken);
  const withTenant = new Set((tree.tenants ?? tree).flatMap((t) => (t.members ?? []).map((m) => m.userId)));
  const orphans = users.filter((u) => u.role !== "ROLE_ADMIN" && !withTenant.has(u.id));
  check("Nadie quedó sin organización", orphans.length === 0,
    orphans.length ? orphans.map((u) => u.username).join(", ") : `${users.length} usuarios revisados`);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
