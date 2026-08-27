/**
 * Tipo 2: el vendedor del distribuidor solo ve sus cuentas; el gerente ve todas
 * y puede generar un código de vinculación.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-distributor-portfolio.mjs
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
  console.log(`Verificando cartera del distribuidor en ${API_URL}\n`);

  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const tree = (await call("GET", "/admin/tenants", adminToken)).payload.data;
  const distros = (tree.tenants ?? tree).filter((t) => t.type === "DISTRIBUTOR" && (t.clients ?? []).length > 0);
  const distro = distros.find((t) =>
    t.members.some((m) => m.tenantRole === "OWNER") && t.members.some((m) => m.tenantRole === "SELLER")
  ) ?? distros[0];
  if (!distro) throw new Error("Hace falta un distribuidor con clientes. Corré scripts/seed-demo-tenants.mjs");

  const dueño = distro.members.find((m) => m.tenantRole === "OWNER");
  const vendedor = distro.members.find((m) => m.tenantRole === "SELLER");
  const tokenDueño = (await call("POST", `/admin/users/${dueño.userId}/impersonate`, adminToken)).payload.data?.token;

  const cartera = await call("GET", "/my/clients", tokenDueño);
  check("El gerente ve la cartera", cartera.status === 200 && (cartera.payload.data?.clients?.length ?? 0) > 0,
    `HTTP ${cartera.status}, ${cartera.payload.data?.clients?.length ?? 0} clientes`);

  const codigo = await call("POST", "/my/access-codes", tokenDueño, { label: "check", maxUses: 1 });
  check("El gerente genera un código", codigo.status === 200 || codigo.status === 201,
    `HTTP ${codigo.status}`);
  const codeId = codigo.payload.data?.id;
  if (codeId) await call("DELETE", `/my/access-codes/${codeId}`, tokenDueño);

  if (vendedor) {
    const tokenVendedor = (await call("POST", `/admin/users/${vendedor.userId}/impersonate`, adminToken)).payload.data?.token;
    const vista = await call("GET", "/my/clients", tokenVendedor);
    check("El vendedor puede leer clientes (los suyos o vacío si no tiene)", vista.status === 200,
      `HTTP ${vista.status}, ${vista.payload.data?.clients?.length ?? 0} visibles`);
    const idsDueño = new Set((cartera.payload.data?.clients ?? []).map((c) => c.linkId));
    const ajenos = (vista.payload.data?.clients ?? []).filter((c) => !idsDueño.has(c.linkId));
    check("El vendedor no ve cuentas de otro distribuidor", ajenos.length === 0, `${ajenos.length} de más`);
    const intento = await call("POST", "/my/access-codes", tokenVendedor, { label: "no" });
    check("El vendedor no genera códigos", intento.status === 403 || intento.status === 400,
      `HTTP ${intento.status}`);
  }

  const comercio = (tree.tenants ?? tree).find((t) => t.type === "RETAILER" && t.name !== "Administración");
  if (comercio) {
    const owner = comercio.members.find((m) => m.tenantRole === "OWNER");
    if (owner) {
      const tokenComercio = (await call("POST", `/admin/users/${owner.userId}/impersonate`, adminToken)).payload.data?.token;
      const no = await call("GET", "/my/clients", tokenComercio);
      check("Un comercio no ve la cartera de distribuidor", no.status === 403, `HTTP ${no.status}`);
      const codes = await call("GET", "/my/access-codes", tokenComercio);
      check("Un comercio no lista códigos de vinculación", codes.status === 403, `HTTP ${codes.status}`);
    }
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
