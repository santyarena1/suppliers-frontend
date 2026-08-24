/**
 * Control del Tipo 1: alta de comercio, panel, carrito compartido y tilde del comprador.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-tipo1.mjs
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

function dataOf(res) {
  return res.payload?.data ?? res.payload;
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando Tipo 1 en ${API_URL}\n`);

  const stamp = Date.now().toString(36);
  const commerceName = `Local control ${stamp}`;
  const username = `ctrl_${stamp}`;
  const email = `${username}@nodo.test`;

  const alta = await call("POST", "/auth/register", null, {
    commerceName,
    username,
    email,
  });
  const tokenAdmin = dataOf(alta)?.token;
  check("El alta de comercio devuelve token y entra", Boolean(tokenAdmin), `HTTP ${alta.status}`);
  check("Si no mandó contraseña, se genera una", Boolean(dataOf(alta)?.generatedPassword));

  if (!tokenAdmin) throw new Error("No se pudo crear el comercio de control");

  const perfil = dataOf(await call("GET", "/my/commerce", tokenAdmin));
  check("El perfil del local trae el nombre y el tilde apagado",
    perfil?.name === commerceName && perfil?.buyerCanConfirm === false,
    `${perfil?.name} · tilde=${perfil?.buyerCanConfirm}`);
  check("Quien se da de alta queda como administrador", perfil?.role === "ADMIN", perfil?.role);

  const vendedorUser = `ctrl_v_${stamp}`;
  const invite = await call("POST", "/my/team", tokenAdmin, {
    username: vendedorUser,
    email: `${vendedorUser}@nodo.test`,
    role: "SELLER",
  });
  check("El administrador invita un vendedor y recibe contraseña de una vez",
    invite.status === 200 || invite.status === 201,
    dataOf(invite)?.generatedPassword ? "contraseña generada" : `HTTP ${invite.status}`);

  const viewerUser = `ctrl_m_${stamp}`;
  await call("POST", "/my/team", tokenAdmin, {
    username: viewerUser,
    email: `${viewerUser}@nodo.test`,
    role: "VIEWER",
  });

  const login = async (user, password) => {
    const res = await call("POST", "/auth/login", null, { username: user, password });
    return dataOf(res)?.token;
  };

  const adminLogin = await call("POST", "/auth/login", null, {
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
  });
  const superToken = dataOf(adminLogin)?.token;
  const tree = dataOf(await call("GET", "/admin/tenants", superToken));
  const tenants = tree.tenants ?? tree;
  const local = tenants.find((t) => t.name === commerceName);
  check("El superadmin ve el comercio nuevo en el árbol", Boolean(local), local?.name);
  check("En el árbol el alta quedó como administrador, no como dueño",
    (local?.members ?? []).some((m) => m.username === username && m.tenantRole === "ADMIN"));

  const impersonate = async (userId) =>
    dataOf(await call("POST", `/admin/users/${userId}/impersonate`, superToken))?.token;

  const vendedor = (local?.members ?? []).find((m) => m.username === vendedorUser);
  const miron = (local?.members ?? []).find((m) => m.username === viewerUser);
  const tokenVendedor = vendedor ? await impersonate(vendedor.userId) : null;
  const tokenMiron = miron ? await impersonate(miron.userId) : null;

  const item = {
    provider: "ELIT",
    externalId: `ctrl-${stamp}`,
    name: "Teclado de control",
    price: "10",
    imageUrl: "",
    quantity: 2,
    snapshot: { provider: "ELIT", name: "Teclado de control", externalId: `ctrl-${stamp}` },
  };
  const addAdmin = await call("POST", "/cart/items", tokenAdmin, item);
  check("El administrador agrega al carrito compartido",
    addAdmin.status === 200 || addAdmin.status === 201, `HTTP ${addAdmin.status}`);

  const carritoVendedor = dataOf(await call("GET", "/cart", tokenVendedor)) ?? [];
  check("El vendedor ve lo que agregó el administrador",
    carritoVendedor.some((i) => i.externalId === item.externalId),
    `${carritoVendedor.length} ítems`);

  const addMiron = await call("POST", "/cart/items", tokenMiron, { ...item, externalId: "no-debe" });
  check("Solo lectura no puede mutar el carrito", addMiron.status === 403, `HTTP ${addMiron.status}`);

  const carritoMiron = dataOf(await call("GET", "/cart", tokenMiron)) ?? [];
  check("Solo lectura puede ver el carrito",
    Array.isArray(carritoMiron) && carritoMiron.some((i) => i.externalId === item.externalId));

  const redeemVendedor = await call("POST", "/my/redeem-code", tokenVendedor, { code: "XXXX-XXXX-XXXX" });
  check("El vendedor no canjea códigos", redeemVendedor.status === 403, `HTTP ${redeemVendedor.status}`);

  const proveedores = dataOf(await call("GET", "/my/providers", tokenAdmin)) ?? [];
  check("El comercio no ve el descuento del vínculo",
    proveedores.every((p) => !("discountPercent" in p) || p.discountPercent == null));

  const pendingVendedor = dataOf(await call("GET", "/orders/pending-approval", tokenVendedor));
  check("El vendedor siempre necesita firma",
    pendingVendedor?.needsApproval === true && pendingVendedor?.canApprove === false);

  const pendingAdmin = dataOf(await call("GET", "/orders/pending-approval", tokenAdmin));
  check("El administrador no espera firma",
    pendingAdmin?.needsApproval === false && pendingAdmin?.canApprove === true);

  const tildeOn = await call("PUT", "/my/commerce/orders", tokenAdmin, { buyerCanConfirm: true });
  check("El administrador prende el tilde del comprador",
    dataOf(tildeOn)?.buyerCanConfirm === true, `HTTP ${tildeOn.status}`);

  const tildeVendedor = await call("PUT", "/my/commerce/orders", tokenVendedor, { buyerCanConfirm: false });
  check("El vendedor no toca el tilde", tildeVendedor.status === 403, `HTTP ${tildeVendedor.status}`);

  await call("DELETE", "/cart", tokenAdmin);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
