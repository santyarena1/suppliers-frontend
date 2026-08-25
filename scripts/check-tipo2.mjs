/**
 * Control del Tipo 2: cartera del distribuidor, aislamiento del vendedor,
 * códigos, chat y publicidad.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-tipo2.mjs
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

function tenantIdFrom(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).tenantId;
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando Tipo 2 en ${API_URL}\n`);

  const stamp = Date.now().toString(36);
  const adminLogin = await call("POST", "/auth/login", null, {
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
  });
  const superToken = dataOf(adminLogin)?.token;
  check("El superadmin entra", Boolean(superToken), `HTTP ${adminLogin.status}`);
  if (!superToken) throw new Error("No se pudo entrar como superadmin");

  const distro = dataOf(await call("POST", "/admin/tenants", superToken, {
    name: `Mayorista control ${stamp}`,
    type: "DISTRIBUTOR",
    contactEmail: `distro_${stamp}@nodo.test`,
  }));
  check("Se crea un distribuidor sin alta pública", Boolean(distro?.id), distro?.name);

  const gerente = dataOf(await call("POST", `/admin/tenants/${distro.id}/members/new-user`, superToken, {
    username: `dger_${stamp}`,
    email: `dger_${stamp}@nodo.test`,
    role: "OWNER",
  }));
  const vendedor = dataOf(await call("POST", `/admin/tenants/${distro.id}/members/new-user`, superToken, {
    username: `dven_${stamp}`,
    email: `dven_${stamp}@nodo.test`,
    role: "SELLER",
  }));
  check("Se invita gerente y vendedor con contraseña de una vez",
    Boolean(gerente?.generatedPassword && vendedor?.generatedPassword));

  const localA = dataOf(await call("POST", "/auth/register", null, {
    commerceName: `Local A ${stamp}`,
    username: `la_${stamp}`,
    email: `la_${stamp}@nodo.test`,
  }));
  const localB = dataOf(await call("POST", "/auth/register", null, {
    commerceName: `Local B ${stamp}`,
    username: `lb_${stamp}`,
    email: `lb_${stamp}@nodo.test`,
  }));
  check("Hay dos comercios de control", Boolean(localA?.token && localB?.token));

  const retailerA = { id: tenantIdFrom(localA.token) };
  const retailerB = { id: tenantIdFrom(localB.token) };

  const linkA = dataOf(await call("PUT", "/admin/tenants/links", superToken, {
    clientTenantId: retailerA.id,
    supplierTenantId: distro.id,
    accountManagerId: vendedor.userId ?? vendedor.user?.id,
    status: "ACTIVE",
    discountPercent: 5,
  }));
  const linkB = dataOf(await call("PUT", "/admin/tenants/links", superToken, {
    clientTenantId: retailerB.id,
    supplierTenantId: distro.id,
    status: "ACTIVE",
  }));
  check("Se vinculan los dos locales; el vendedor queda en uno solo",
    Boolean(linkA?.id) && Boolean(linkB?.id));

  const login = async (user, password) => {
    const res = await call("POST", "/auth/login", null, { username: user, password });
    return dataOf(res)?.token;
  };

  const tokenGerente = await login(`dger_${stamp}`, gerente.generatedPassword);
  const tokenVendedor = await login(`dven_${stamp}`, vendedor.generatedPassword);
  check("Gerente y vendedor entran", Boolean(tokenGerente && tokenVendedor));

  const carteraGerente = dataOf(await call("GET", "/my/clients", tokenGerente));
  const carteraVendedor = dataOf(await call("GET", "/my/clients", tokenVendedor));
  const clientesG = carteraGerente?.clients ?? [];
  const clientesV = carteraVendedor?.clients ?? [];
  check("El gerente ve los dos clientes", clientesG.length === 2, `vio ${clientesG.length}`);
  check("El vendedor ve solo el suyo", clientesV.length === 1, `vio ${clientesV.length}`);

  const ajeno = clientesG.find((c) => !clientesV.some((v) => v.linkId === c.linkId));
  const ajenoGet = await call("GET", `/my/clients/${ajeno?.linkId}`, tokenVendedor);
  check("El vendedor no entra al cliente de un compañero",
    ajenoGet.status === 404 || ajenoGet.status === 403,
    `HTTP ${ajenoGet.status}`);

  const descuento = await call("PUT", `/my/clients/${clientesV[0]?.linkId}`, tokenVendedor, {
    discountPercent: 8,
  });
  check("El vendedor puede cargar un descuento puntual en su cliente",
    descuento.status === 200 || descuento.status === 201,
    `HTTP ${descuento.status}`);

  const asignar = await call("PUT", `/my/clients/${clientesV[0]?.linkId}`, tokenVendedor, {
    accountManagerId: gerente.userId ?? gerente.user?.id,
  });
  check("El vendedor no reasigna la cuenta",
    asignar.status === 403,
    `HTTP ${asignar.status}`);

  const codigo = dataOf(await call("POST", "/my/access-codes", tokenGerente, {
    label: "Control",
    maxUses: 2,
  }));
  check("El gerente genera un código de vinculación", Boolean(codigo?.code), codigo?.code);

  const vendedorCodigo = await call("POST", "/my/access-codes", tokenVendedor, { maxUses: 1 });
  check("El vendedor no genera códigos",
    vendedorCodigo.status === 403,
    `HTTP ${vendedorCodigo.status}`);

  const publicidad = await call("PUT", "/my/advertising", tokenGerente, { advertisingEnabled: true });
  check("El gerente prende la publicidad",
    dataOf(publicidad)?.advertisingEnabled === true,
    `HTTP ${publicidad.status}`);

  const mio = clientesV[0]?.linkId;
  const chatGerente = await call("POST", `/my/chats/${mio}`, tokenGerente, { body: "Hola desde el mayorista" });
  check("El gerente escribe en el chat del vínculo",
    chatGerente.status === 200 || chatGerente.status === 201,
    `HTTP ${chatGerente.status}`);

  const chatLocal = await call("GET", `/my/chats/${linkA.id ?? mio}`, localA.token);
  const msgs = dataOf(chatLocal)?.messages ?? [];
  check("El comercio lee el chat de su mayorista",
    msgs.some((m) => m.body?.includes("Hola desde el mayorista")),
    `HTTP ${chatLocal.status} · ${msgs.length} msgs`);

  const chatAjeno = await call("GET", `/my/chats/${ajeno?.linkId}`, tokenVendedor);
  check("El vendedor no lee el chat de un compañero",
    chatAjeno.status === 404 || chatAjeno.status === 403,
    `HTTP ${chatAjeno.status}`);

  const comercioCartera = await call("GET", "/my/clients", localA.token);
  check("El comercio no entra a la cartera del mayorista",
    comercioCartera.status === 403,
    `HTTP ${comercioCartera.status}`);

  const pm = await call("POST", "/my/team", tokenGerente, {
    username: `dpm_${stamp}`,
    email: `dpm_${stamp}@nodo.test`,
    role: "PRODUCT_MANAGER",
  });
  check("No se invita Product Manager desde el panel",
    pm.status === 400 || pm.status === 403,
    `HTTP ${pm.status}`);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} controles OK`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
