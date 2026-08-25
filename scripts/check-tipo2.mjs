/**
 * Control del Tipo 2: cartera del distribuidor, aislamiento del vendedor,
 * códigos, chat, publicidad, Product Manager, catálogo propio y descuentos.
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
  const pmData = dataOf(pm);
  check("Se invita Product Manager desde el panel",
    (pm.status === 200 || pm.status === 201) && Boolean(pmData?.generatedPassword),
    `HTTP ${pm.status}`);

  const tokenPm = pmData?.generatedPassword
    ? await login(`dpm_${stamp}`, pmData.generatedPassword)
    : null;
  check("El Product Manager entra", Boolean(tokenPm));

  const pmCartera = dataOf(await call("GET", "/my/clients", tokenPm));
  const pmClientes = pmCartera?.clients ?? [];
  check("El Product Manager ve todos los clientes",
    pmClientes.length === 2,
    `vio ${pmClientes.length}`);
  check("El Product Manager ve qué vendedor tiene cada local",
    pmClientes.some((c) => c.accountManager?.id === (vendedor.userId ?? vendedor.user?.id))
      && pmClientes.some((c) => !c.accountManager),
    pmClientes.map((c) => c.accountManager?.username ?? "sin vendedor").join(", "));

  const pmEdita = await call("PUT", `/my/clients/${pmClientes[0]?.linkId}`, tokenPm, {
    discountPercent: 3,
  });
  check("El Product Manager no edita la cuenta del local",
    pmEdita.status === 403,
    `HTTP ${pmEdita.status}`);

  const pmChat = await call("GET", "/my/chats", tokenPm);
  check("El Product Manager no entra al chat",
    pmChat.status === 403,
    `HTTP ${pmChat.status}`);

  const carritoMayorista = await call("POST", "/cart/items", tokenGerente, {
    provider: "NEW_BYTES",
    externalId: "control-no-cart",
    name: "No",
    price: "1",
    imageUrl: "https://nodo.test/x.png",
    quantity: 1,
  });
  check("El mayorista no agrega al carrito",
    carritoMayorista.status === 403,
    `HTTP ${carritoMayorista.status}`);

  const searchAjeno = await call("GET", "/search/provider/ELIT?name=a", tokenGerente);
  const searchAjenoItems = dataOf(searchAjeno);
  check("La búsqueda de otra integración no devuelve nada",
    searchAjeno.status === 200 && Array.isArray(searchAjenoItems) && searchAjenoItems.length === 0,
    `HTTP ${searchAjeno.status} · ${Array.isArray(searchAjenoItems) ? searchAjenoItems.length : "?"} ítems`);

  const pmSearchVacío = await call("GET", "/search/provider/NEW_BYTES?name=a", tokenPm);
  const pmSearchItems = dataOf(pmSearchVacío);
  check("Sin marcas asignadas el Product Manager no ve catálogo",
    pmSearchVacío.status === 200 && Array.isArray(pmSearchItems) && pmSearchItems.length === 0,
    `HTTP ${pmSearchVacío.status}`);

  const descuentoAjeno = await call("PUT", "/my/brand-discounts", tokenPm, {
    brandName: "GIGABYTE",
    discountPercent: 10,
  });
  check("El Product Manager no carga descuento de una marca que no es suya",
    descuentoAjeno.status === 403,
    `HTTP ${descuentoAjeno.status}`);

  const asignarMarcas = await call("PUT", `/my/team/${pmData?.membershipId}/brands`, tokenGerente, {
    brandNames: ["GIGABYTE"],
  });
  check("El gerente asigna marcas al Product Manager",
    asignarMarcas.status === 200 || asignarMarcas.status === 201,
    `HTTP ${asignarMarcas.status}`);

  const descuentoMarca = await call("PUT", "/my/brand-discounts", tokenPm, {
    brandName: "GIGABYTE",
    discountPercent: 7,
  });
  check("El Product Manager carga el descuento de su marca",
    (descuentoMarca.status === 200 || descuentoMarca.status === 201)
      && Number(dataOf(descuentoMarca)?.discountPercent) === 7
      && dataOf(descuentoMarca)?.appliesToAll === true,
    `HTTP ${descuentoMarca.status}`);

  const localesPm = dataOf(await call("GET", "/my/discount-clients", tokenPm));
  check("El Product Manager ve los locales para asignar descuentos",
    Array.isArray(localesPm) && localesPm.length === 2,
    `${Array.isArray(localesPm) ? localesPm.length : "?"} locales`);

  const descuentoVacio = await call("PUT", "/my/brand-discounts", tokenPm, {
    brandName: "GIGABYTE",
    discountPercent: 7,
    appliesToAll: false,
    clientTenantIds: [],
  });
  check("Sin locales no se guarda un descuento puntual",
    descuentoVacio.status === 400,
    `HTTP ${descuentoVacio.status}`);

  const descuentoLocal = await call("PUT", "/my/brand-discounts", tokenPm, {
    brandName: "GIGABYTE",
    discountPercent: 7,
    appliesToAll: false,
    clientTenantIds: [retailerA.id],
  });
  const descuentoLocalData = dataOf(descuentoLocal);
  check("El Product Manager asigna el descuento a un local",
    (descuentoLocal.status === 200 || descuentoLocal.status === 201)
      && descuentoLocalData?.appliesToAll === false
      && descuentoLocalData?.clients?.some((c) => c.id === retailerA.id),
    `HTTP ${descuentoLocal.status}`);

  const descuentoOtra = await call("PUT", "/my/brand-discounts", tokenPm, {
    brandName: "ASUS",
    discountPercent: 5,
  });
  check("El Product Manager no carga descuento de otra marca",
    descuentoOtra.status === 403,
    `HTTP ${descuentoOtra.status}`);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} controles OK`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
