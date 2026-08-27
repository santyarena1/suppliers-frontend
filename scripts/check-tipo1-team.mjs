/**
 * Tipo 1 autónomo: el dueño de un comercio arma su equipo sin ser superadmin.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-tipo1-team.mjs
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

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando equipo autónomo en ${API_URL}\n`);

  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const tree = (await call("GET", "/admin/tenants", adminToken)).payload.data;
  const tenants = (tree.tenants ?? tree).filter(
    (t) => t.type === "RETAILER" && t.name !== "Administración" && (t.members ?? []).length > 0
  );
  const comercio = tenants.find((t) => t.members.some((m) => m.tenantRole === "OWNER" && m.platformRole !== "ROLE_ADMIN"));
  if (!comercio) throw new Error("Hace falta un comercio con dueño (no superadmin)");
  const dueño = comercio.members.find((m) => m.tenantRole === "OWNER");
  const vendedor = comercio.members.find((m) => m.tenantRole === "SELLER");

  const tokenDueño = (await call("POST", `/admin/users/${dueño.userId}/impersonate`, adminToken)).payload.data?.token;
  const team = await call("GET", "/my/team", tokenDueño);
  check("El dueño lee su equipo", team.status === 200 && team.payload.data?.canManage === true,
    `HTTP ${team.status}`);

  const username = `check.tipo1.${Date.now().toString(36)}`;
  const alta = await call("POST", "/my/team", tokenDueño, {
    username,
    email: `${username}@nodo.test`,
    role: "VIEWER",
    title: "Prueba",
  });
  check("El dueño crea una persona y recibe la contraseña",
    (alta.status === 200 || alta.status === 201) && Boolean(alta.payload.data?.generatedPassword),
    `HTTP ${alta.status}`);
  const membershipId = alta.payload.data?.membershipId;

  try {
    if (vendedor) {
      const tokenVendedor = (await call("POST", `/admin/users/${vendedor.userId}/impersonate`, adminToken)).payload.data?.token;
      const intento = await call("POST", "/my/team", tokenVendedor, {
        username: `${username}.no`,
        email: `${username}.no@nodo.test`,
        role: "VIEWER",
      });
      check("Un vendedor no arma el equipo", intento.status === 403, `HTTP ${intento.status}`);
    }
  } finally {
    if (membershipId) await call("DELETE", `/my/team/${membershipId}`, tokenDueño);
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
