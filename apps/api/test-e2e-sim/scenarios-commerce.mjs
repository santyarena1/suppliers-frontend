// Escenarios 6 a 9: vínculo con distribuidor, lista de precios, carrito/pedido y plan.
import { api, scenario, sleep } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";

const DAY = 86_400_000;

function csvFor(prefix, tag) {
  const rows = [
    ["Codigo", "Descripcion", "Marca", "Categoria", "Precio", "IVA", "Stock", "Moneda"],
    [`${tag}-001`, `Mouse Simulado ${prefix} Inalambrico`, "SimBrand", "Perifericos", "12.50", "21", "40", "USD"],
    [`${tag}-002`, `Teclado Simulado ${prefix} Mecanico`, "SimBrand", "Perifericos", "35.90", "21", "15", "USD"],
    [`${tag}-003`, `Monitor Simulado ${prefix} 24 pulgadas`, "SimView", "Monitores", "149.00", "10.5", "8", "USD"],
    [`${tag}-004`, `Auricular Simulado ${prefix} USB`, "SimBrand", "Audio", "19.99", "21", "22", "USD"],
    [`${tag}-005`, `Webcam Simulada ${prefix} HD`, "SimView", "Perifericos", "29.00", "21", "0", "USD"],
    [`${tag}-006`, `SSD Simulado ${prefix} 1TB`, "SimStore", "Almacenamiento", "64.00", "21", "30", "USD"],
    [`${tag}-007`, `Router Simulado ${prefix} WiFi 6`, "SimNet", "Redes", "55.00", "21", "12", "USD"],
    [`${tag}-008`, `Cable Simulado ${prefix} HDMI 2m`, "SimNet", "Cables", "3.20", "21", "200", "USD"],
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

/** Sube una planilla, espera el procesamiento y la aplica si queda en revisión. */
async function uploadList(s, token, providerKey, csv, label) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), `${label}.csv`);
  const up = await api("POST", `/providers/${providerKey}/imports`, { token, form });
  s.check(`${label}: subir planilla → 201`, up.status === 201 && up.data?.id, up);
  const id = up.data?.id;
  if (!id) return { id: null, final: up };
  let rec = up;
  for (let i = 0; i < 80 && rec.data?.status === "PROCESSING"; i++) {
    await sleep(500);
    rec = await api("GET", `/providers/${providerKey}/imports/${id}`, { token });
  }
  s.check(`${label}: termina de procesar (no FAILED)`, rec.data && !["PROCESSING", "FAILED"].includes(rec.data.status), { status: rec.data?.status, error: rec.data?.error, reviewReasons: rec.data?.reviewReasons });
  if (rec.data?.status === "NEEDS_REVIEW") {
    s.note(`${label}: quedó en revisión (${JSON.stringify(rec.data?.reviewReasons ?? []).slice(0, 200)}); se aplica a mano`);
    const ap = await api("POST", `/providers/${providerKey}/imports/${id}/apply`, { token });
    s.check(`${label}: aplicar → 2xx`, ap.status < 300, ap);
    rec = ap;
    for (let i = 0; i < 80 && rec.data?.status !== "APPLIED"; i++) {
      await sleep(500);
      rec = await api("GET", `/providers/${providerKey}/imports/${id}`, { token });
      if (rec.data?.status === "FAILED") break;
    }
  }
  s.check(`${label}: queda APPLIED`, rec.data?.status === "APPLIED", { status: rec.data?.status, summary: rec.data?.summary, error: rec.data?.error });
  return { id, final: rec };
}

/** Distribuidor por lista creado por el superadmin, con su dueño. */
async function createDistributor(ctx, s, keyBase, label) {
  const exists = await ctx.prisma.tenant.findUnique({ where: { providerKey: keyBase } });
  const providerKey = exists ? `${keyBase}_${ctx.stamp}` : keyBase;
  const t = await api("POST", "/admin/tenants", {
    token: ctx.admin.token,
    body: { name: `${label} ${ctx.prefix}`, type: "DISTRIBUTOR", providerKey, contactEmail: `${label.toLowerCase()}@sim.nodo.test` },
  });
  s.check(`superadmin crea DISTRIBUTOR ${providerKey} → 201`, t.status === 201 && t.data?.id, t);
  const username = `${ctx.prefix}-${label.toLowerCase().slice(0, 6)}`;
  const password = "Sim-Dist-Pass1!";
  const m = await api("POST", `/admin/tenants/${t.data?.id}/members/new-user`, {
    token: ctx.admin.token,
    body: { username, email: `${username}@sim.nodo.test`, password, role: "OWNER" },
  });
  s.check(`superadmin crea el dueño de ${label} → 201`, m.status === 201, m);
  const login = await api("POST", "/auth/login", { body: { username, password } });
  s.check(`dueño de ${label} entra`, login.status === 200, login);
  return { tenantId: t.data?.id, providerKey, token: login.data?.token, username };
}

async function newCode(s, dist, maxUses = 1) {
  const c = await api("POST", "/my/access-codes", { token: dist.token, body: { label: "sim", maxUses, expiresInDays: 7 } });
  s.check(`distribuidor genera código (maxUses ${maxUses}) → 201`, c.status === 201 && c.data?.code, c);
  return c.data?.code;
}

export async function s6Link(ctx) {
  const s = scenario("S6", "Vínculo con distribuidor por código");
  ctx.dist = await createDistributor(ctx, s, "LIST_SIMDIST", "SimDist");
  ctx.otherDist = await createDistributor(ctx, s, "LIST_SIMOTRO", "SimOtro");
  const dist = ctx.dist;

  const retailerCode = await api("POST", "/my/access-codes", { token: ctx.owner.token, body: { label: "x" } });
  s.check("un comercio no genera códigos → 403", retailerCode.status === 403, retailerCode);
  const codeList = await api("GET", "/my/access-codes", { token: dist.token });
  s.check("distribuidor lista sus códigos → 200", codeList.status === 200, codeList);

  const code = await newCode(s, dist);
  const bad = await api("POST", "/my/redeem-code", { token: ctx.owner.token, body: { code: "NOEXISTE99" } });
  s.check("código inexistente → 400", bad.status === 400, bad);
  const red = await api("POST", "/my/redeem-code", { token: ctx.owner.token, body: { code: code?.toLowerCase() } });
  s.check("comercio canjea el código (en minúsculas) → 201 y revela el proveedor", red.status === 201 && red.data?.provider === dist.providerKey, red);
  ctx.ownerLinkId = red.data?.linkId;
  const again = await api("POST", "/my/redeem-code", { token: ctx.third.token, body: { code } });
  s.check("código de un solo uso ya usado → 400 mismo mensaje", again.status === 400 && again.body?.message === bad.body?.message, again);
  const provs = await api("GET", "/my/providers", { token: ctx.owner.token });
  const mine = (provs.data ?? []).find((p) => p.provider === dist.providerKey);
  s.check("el distribuidor aparece en /my/providers del comercio (linked)", Boolean(mine?.linked), { mine, providers: (provs.data ?? []).map((p) => p.provider) });
  const clients = await api("GET", "/my/clients", { token: dist.token });
  const asClient = JSON.stringify(clients.data ?? "").includes(ctx.owner.tenantId);
  s.check("el comercio aparece en /my/clients del distribuidor", clients.status === 200 && asClient, clients);
  const distProviders = await api("GET", "/my/providers", { token: dist.token });
  s.check("el distribuidor ve su propio catálogo en /my/providers", distProviders.status === 200 && distProviders.data?.[0]?.provider === dist.providerKey, distProviders);

  // Carrera: tres comercios canjean a la vez un código de un solo uso.
  const fourth = await registerVerified(ctx, "race");
  const b4 = await api("POST", "/onboarding/bootstrap", { token: fourth.token, body: { name: `Comercio ${ctx.prefix} Race`, trialPlan: "BASE" } });
  fourth.token = b4.data?.token;
  fourth.tenantId = b4.data?.org?.id;
  ctx.fourth = fourth;
  const raceCode = await newCode(s, dist);
  const race = await Promise.all(
    [ctx.base, ctx.third, fourth].map((r) => api("POST", "/my/redeem-code", { token: r.token, body: { code: raceCode } }))
  );
  const wins = race.filter((r) => r.status === 201).length;
  const row = await ctx.prisma.tenantAccessCode.findUnique({ where: { code: raceCode ?? "" } });
  s.check("código de 1 uso canjeado en paralelo por 3 comercios → 1 solo canje", wins === 1, { wins, statuses: race.map((r) => r.status), usedCount: row?.usedCount, maxUses: row?.maxUses }, {
    hint: "tenants.service.ts:634-673 redeemAccessCode valida usedCount < maxUses y después incrementa sin condición en la misma transacción (check-then-act)",
  });
  // Que el comercio BASE quede vinculado sí o sí para S8/S9.
  const baseLinked = await ctx.prisma.tenantLink.findFirst({ where: { clientTenantId: ctx.base.tenantId, supplierTenantId: dist.tenantId } });
  if (!baseLinked) {
    const c2 = await newCode(s, dist);
    await api("POST", "/my/redeem-code", { token: ctx.base.token, body: { code: c2 } });
  }

  const revoke = await newCode(s, dist);
  const rv = await api("DELETE", `/my/access-codes/${row?.id}`, { token: dist.token });
  s.check("distribuidor revoca un código → 200", rv.status === 200, rv);
  ctx.spareCode = revoke;
}

export async function s7PriceList(ctx) {
  const s = scenario("S7", "Lista de precios del distribuidor y búsqueda");
  const dist = ctx.dist;
  const imp = await uploadList(s, dist.token, dist.providerKey, csvFor(ctx.prefix, "SIM"), "lista base del distribuidor");
  ctx.importId = imp.id;

  const offers = await ctx.prisma.tenantProductOffer.count({ where: { tenantId: ctx.owner.tenantId, provider: dist.providerKey, active: true } });
  s.check("la lista base se materializa como ofertas del comercio vinculado", offers >= 7, { offers });
  const search = await api("GET", `/search/provider/${dist.providerKey}?name=${encodeURIComponent("mouse simulado")}`, { token: ctx.owner.token });
  const hit = Array.isArray(search.data) ? search.data.find((p) => /Mouse Simulado/i.test(p.name ?? "")) : null;
  s.check("búsqueda del comercio devuelve el producto de la lista", search.status === 200 && Boolean(hit), { status: search.status, count: search.data?.length, first: search.data?.[0] });
  const brand = await api("GET", `/search/provider/${dist.providerKey}?name=&brand=SimView`, { token: ctx.owner.token });
  s.check("búsqueda por marca → 200 con resultados", brand.status === 200 && (brand.data?.length ?? 0) >= 1, { status: brand.status, count: brand.data?.length });
  const oos = await api("GET", `/search/provider/${dist.providerKey}?name=webcam%20simulada`, { token: ctx.owner.token });
  const oosAll = await api("GET", `/search/provider/${dist.providerKey}?name=webcam%20simulada&includeOutOfStock=true`, { token: ctx.owner.token });
  s.note(`Producto sin stock: sin includeOutOfStock → ${oos.data?.length ?? oos.status}; con includeOutOfStock → ${oosAll.data?.length ?? oosAll.status}`);
  const catalog = await api("GET", `/providers/${dist.providerKey}/catalog?q=`, { token: ctx.owner.token });
  s.check("/providers/:p/catalog del comercio → 200 con total", catalog.status === 200 && (catalog.data?.total ?? 0) >= 1, { status: catalog.status, total: catalog.data?.total });
  const unlinked = await api("GET", `/search/provider/${dist.providerKey}?name=mouse`, { token: ctx.fourth.token });
  const fourthLinked = await ctx.prisma.tenantLink.findFirst({ where: { clientTenantId: ctx.fourth.tenantId, supplierTenantId: dist.tenantId } });
  if (!fourthLinked) s.check("comercio NO vinculado no ve el catálogo en la búsqueda", unlinked.status === 200 && (unlinked.data?.length ?? 0) === 0, unlinked);
  const invalid = await api("GET", "/search/provider/no-existe?name=x", { token: ctx.owner.token });
  s.check("búsqueda con proveedor inválido → 400", invalid.status === 400, invalid);

  if (hit) {
    ctx.listItem = {
      externalId: hit.externalId ?? hit.id ?? "SIM-001",
      sku: hit.sku ?? undefined,
      name: hit.name,
      unitPrice: Number(hit.price ?? hit.finalPrice ?? 12.5),
      ivaPercent: Number(hit.ivaPercent ?? 21),
      pricingMode: "list",
    };
  } else {
    ctx.listItem = { externalId: "SIM-001", name: `Mouse Simulado ${ctx.prefix}`, unitPrice: 12.5, ivaPercent: 21, pricingMode: "list" };
  }
}

export async function s8CartOrder(ctx) {
  const s = scenario("S8", "Carrito y pedido por lista");
  const o = ctx.owner;
  const dist = ctx.dist;
  const item = ctx.listItem;
  const add = await api("POST", "/cart/items", { token: o.token, body: { provider: dist.providerKey, externalId: item.externalId, name: item.name, price: String(item.unitPrice), imageUrl: "", quantity: 2 } });
  s.check("agregar al carrito personal → 201", add.status === 201, add);
  const cartItems = [{ provider: dist.providerKey, externalId: item.externalId, name: item.name, qty: 2, price: item.unitPrice }];
  ctx.cartItems = cartItems;
  const put = await api("PUT", "/cart/org", { token: o.token, body: { items: cartItems } });
  s.check("guardar el carrito del local → 200", put.status === 200 && put.data?.items?.length === 1, put);
  const get = await api("GET", "/cart/org", { token: o.token });
  s.check("leer el carrito del local → 200 con el ítem", get.status === 200 && get.data?.items?.length === 1, get);
  const distCart = await api("GET", "/cart/org", { token: dist.token });
  s.check("el distribuidor no tiene carrito propio → 403", distCart.status === 403, distCart);

  const order = await api("POST", "/orders/offline", { token: o.token, body: { orders: [{ provider: dist.providerKey, notes: `Pedido sim ${ctx.prefix}`, items: [{ ...item, qty: 2 }] }] } });
  const row = Array.isArray(order.data) ? order.data[0] : null;
  s.check("comercio PRO registra un pedido por lista → 201", order.status === 201 && row?.id, order);
  ctx.ownerOrderId = row?.id;
  const list = await api("GET", "/orders", { token: o.token });
  const mineOrders = Array.isArray(list.data) ? list.data : list.data?.orders ?? [];
  s.check("el pedido aparece en /orders del comercio", mineOrders.some((r) => r.id === row?.id), { status: list.status, count: mineOrders.length });
  const offlineMode = await api("POST", "/orders/offline", { token: o.token, body: { orders: [{ provider: dist.providerKey, items: [{ ...item, qty: 1, pricingMode: "offline" }] }] } });
  s.note(`Pedido modo "offline" a un proveedor vinculado por código sin configurar: ${offlineMode.status} ${offlineMode.body?.message ?? ""}`);
  const notLinked = await api("POST", "/orders/offline", { token: o.token, body: { orders: [{ provider: ctx.otherDist.providerKey, items: [{ ...item, qty: 1 }] }] } });
  s.check("pedido a un proveedor NO vinculado → 4xx", notLinked.status >= 400 && notLinked.status < 500, notLinked);
  const edit = await api("PATCH", `/orders/${row?.id}`, { token: o.token, body: { notes: "editado" } });
  s.check("editar nota del pedido propio → 200", edit.status === 200, edit);

  const co = await api("GET", "/my/clients/orders", { token: dist.token });
  const coRows = Array.isArray(co.data) ? co.data : [];
  s.check("el pedido aparece en 'pedidos de clientes' del distribuidor", coRows.some((r) => r.id === row?.id), { status: co.status, count: coRows.length });
  const foreign = coRows.filter((r) => r.provider !== dist.providerKey);
  s.check("el distribuidor ve SOLO los pedidos hechos a él (no los de otros proveedores)", foreign.length === 0, { ajenos: foreign.map((r) => ({ id: r.id, provider: r.provider, clientName: r.clientName, total: r.total })) }, {
    hint: "portfolio.service.ts:201-209 (listClientOrders) y :320-329 (ordersOf) filtran providerOrder solo por tenantId del cliente, sin provider = providerKey del distribuidor",
  });
  const client = await api("GET", `/my/clients/${ctx.ownerLinkId}`, { token: dist.token });
  s.check("detalle del cliente en el distribuidor → 200", client.status === 200, client);
  const otherDistOrders = await api("GET", "/my/clients/orders", { token: ctx.otherDist.token });
  const leak = (Array.isArray(otherDistOrders.data) ? otherDistOrders.data : []).some((r) => r.id === row?.id);
  s.check("un distribuidor NO vinculado no ve el pedido", !leak, { status: otherDistOrders.status });

  const cc = await api("GET", `/cart/clients/${ctx.ownerLinkId}`, { token: dist.token });
  s.check("el distribuidor ve el carrito del comercio vinculado → 200", cc.status === 200, cc);
  // El carrito real del local mezcla proveedores: se agrega uno de la demo.
  const mixed = [...cartItems, { provider: "LIST_DEMO_NORTE", externalId: "demo-x", name: "Producto de otro proveedor", qty: 1, price: 99 }];
  await api("PUT", "/cart/org", { token: o.token, body: { items: mixed } });
  const cc2 = await api("GET", `/cart/clients/${ctx.ownerLinkId}`, { token: dist.token });
  const otherItems = (cc2.data?.items ?? []).filter((i) => i.provider !== dist.providerKey);
  s.check("el distribuidor ve SOLO sus ítems del carrito del comercio", otherItems.length === 0, { ajenos: otherItems }, {
    hint: "cart.service.ts:50-66 getClientCart devuelve el OrgCart entero sin filtrar por el providerKey del distribuidor",
  });
  await api("PUT", "/cart/org", { token: o.token, body: { items: cartItems } });

  // El comercio BASE también puede mandar su pedido por lista (manualOnly).
  const baseOrder = await api("POST", "/orders/offline", { token: ctx.base.token, body: { orders: [{ provider: dist.providerKey, items: [{ ...item, qty: 3 }] }] } });
  s.check("comercio BASE registra un pedido por lista → 201", baseOrder.status === 201, baseOrder);
}

export async function s9Plan(ctx) {
  const s = scenario("S9", "Plan BASE (tope 5) y vencimiento de la prueba");
  const b = ctx.base;
  const before = await api("GET", "/my/providers", { token: b.token });
  let linked = (before.data ?? []).filter((p) => p.linked).length;
  const created = [];
  for (let i = 1; linked + created.length < 7 && i <= 7; i++) {
    const r = await api("POST", "/providers", { token: b.token, body: { name: `Prov Lista ${ctx.prefix} ${i}`, type: "DISTRIBUTOR" } });
    s.check(`BASE crea proveedor por lista #${i} → 201`, r.status === 201 && r.data?.providerKey, r);
    if (r.data?.providerKey) created.push(r.data.providerKey);
  }
  const provs = await api("GET", "/my/providers", { token: b.token });
  const list = provs.data ?? [];
  linked = list.filter((p) => p.linked).length;
  const inSearch = list.filter((p) => p.inSearch);
  s.check("BASE con ≥6 proveedores conectados", linked >= 6, { linked, providers: list.map((p) => `${p.provider}:${p.inSearch ? "on" : "off"}`) });
  s.check("BASE: como máximo 5 en búsqueda", inSearch.length <= 5, { inSearch: inSearch.map((p) => p.provider) });
  const sub = await api("GET", "/my/subscription", { token: b.token });
  s.check("/my/subscription usage coherente (activos ≤ 5, máx 5)", sub.data?.usage?.maxSearchProviders === 5 && sub.data?.usage?.activeSearchProviders <= 5 && sub.data?.usage?.connectedProviders === linked, sub.data?.usage);
  const off = list.find((p) => p.linked && !p.inSearch);
  if (off) {
    const on = await api("PUT", `/my/providers/${off.provider}/search`, { token: b.token, body: { enabled: true } });
    s.check("prender el 6.º proveedor → 409 PLAN_SEARCH_LIMIT", on.status === 409 && on.body?.code === "PLAN_SEARCH_LIMIT", on);
  }
  // Lista propia (nivel TENANT) en un proveedor creado por el comercio.
  const own = created[0];
  if (own) {
    await uploadList(s, b.token, own, csvFor(ctx.prefix, "OWN"), "lista propia del comercio BASE");
    const visible = (await api("GET", "/my/providers", { token: b.token })).data?.find((p) => p.provider === own);
    const r = await api("GET", `/search/provider/${own}?name=router%20simulado`, { token: b.token });
    if (visible?.inSearch) s.check("búsqueda en la lista propia → resultados", (r.data?.length ?? 0) >= 1, { status: r.status, count: r.data?.length });
    else s.check("lista propia fuera del tope → búsqueda vacía (no error)", r.status === 200 && (r.data?.length ?? 0) === 0, r);
  }
  // Apagar uno y volver a prenderlo.
  const active = (await api("GET", "/my/providers", { token: b.token })).data?.find((p) => p.inSearch && p.provider === ctx.dist.providerKey);
  if (active) {
    const r0 = await api("GET", `/search/provider/${active.provider}?name=mouse%20simulado`, { token: b.token });
    s.check("BASE busca en SimDist (activo) → resultados", (r0.data?.length ?? 0) >= 1, { status: r0.status, count: r0.data?.length });
    const turnOff = await api("PUT", `/my/providers/${active.provider}/search`, { token: b.token, body: { enabled: false } });
    s.check("apagar SimDist en búsqueda → 200 inSearch=false", turnOff.status === 200 && turnOff.data?.inSearch === false, turnOff);
    const r1 = await api("GET", `/search/provider/${active.provider}?name=mouse%20simulado`, { token: b.token });
    s.check("proveedor apagado → búsqueda vacía", r1.status === 200 && (r1.data?.length ?? 0) === 0, { status: r1.status, count: r1.data?.length });
    const turnOn = await api("PUT", `/my/providers/${active.provider}/search`, { token: b.token, body: { enabled: true } });
    s.check("volver a prender el mismo proveedor que se acaba de apagar → 200", turnOn.status === 200, turnOn, {
      hint: "selectSearchProviders (packages/shared/src/plans.ts) rellena el hueco con un proveedor 'sin tocar' al apagar uno; setIncludeInSearch (tenant-visibility.service.ts:333-355) ve 5 activos y devuelve 409",
    });
  }

  // Vencimiento de la prueba del comercio PRO.
  const o = ctx.owner;
  const ordersBefore = await ctx.prisma.providerOrder.count({ where: { tenantId: o.tenantId } });
  const visibleBefore = (await api("GET", "/orders", { token: o.token })).data?.length ?? -1;
  const offersBefore = await ctx.prisma.tenantProductOffer.count({ where: { tenantId: o.tenantId } });
  await ctx.prisma.subscription.update({ where: { tenantId: o.tenantId }, data: { trialEndsAt: new Date(Date.now() - 2 * DAY) } });
  const grace = await api("GET", "/my/subscription", { token: o.token });
  s.check("prueba vencida hace 2 días → GRACE_PERIOD con acceso FULL", grace.data?.status === "GRACE_PERIOD" && grace.data?.access === "FULL", { status: grace.data?.status, access: grace.data?.access, suspendsAt: grace.data?.suspendsAt });
  const graceWrite = await api("PUT", "/cart/org", { token: o.token, body: { items: ctx.cartItems } });
  s.check("en gracia sigue operando (escribe el carrito)", graceWrite.status === 200, graceWrite);
  await ctx.prisma.subscription.update({ where: { tenantId: o.tenantId }, data: { trialEndsAt: new Date(Date.now() - 10 * DAY) } });
  const susp = await api("GET", "/my/subscription", { token: o.token });
  s.check("prueba vencida hace 10 días → SUSPENDED / RESTRICTED", susp.status === 200 && susp.data?.status === "SUSPENDED" && susp.data?.access === "RESTRICTED", { status: susp.data?.status, access: susp.data?.access });
  const login = await api("POST", "/auth/login", { body: { username: o.username, password: o.password } });
  s.check("suspendido igual puede entrar", login.status === 200, login);
  const w1 = await api("POST", "/cart/items", { token: o.token, body: { provider: ctx.dist.providerKey, externalId: "x", name: "x", price: "1", imageUrl: "", quantity: 1 } });
  s.check("suspendido: escribir → 403 SUBSCRIPTION_SUSPENDED", w1.status === 403 && w1.body?.code === "SUBSCRIPTION_SUSPENDED", w1);
  const w2 = await api("POST", "/orders/offline", { token: o.token, body: { orders: [{ provider: ctx.dist.providerKey, items: [{ ...ctx.listItem, qty: 1 }] }] } });
  s.check("suspendido: pedido nuevo → 403", w2.status === 403, w2);
  const sr = await api("GET", `/search/provider/${ctx.dist.providerKey}?name=mouse`, { token: o.token });
  s.check("suspendido: búsqueda → 403", sr.status === 403, sr);
  const ins = await api("GET", "/orders/insights", { token: o.token });
  s.check("suspendido: analytics (capacidad) → 403", ins.status === 403, ins);
  const ro = await api("GET", "/orders", { token: o.token });
  const roRows = Array.isArray(ro.data) ? ro.data : ro.data?.orders ?? [];
  s.check("suspendido: puede ver sus pedidos (lectura)", ro.status === 200 && roRows.length === visibleBefore, { http: ro.status, visibles: roRows.length, visiblesAntes: visibleBefore, enBaseConDemo: ordersBefore });
  const cart = await api("GET", "/cart/org", { token: o.token });
  s.check("suspendido: puede ver su carrito", cart.status === 200 && cart.data?.items?.length >= 1, cart);
  const org = await api("GET", "/my/org", { token: o.token });
  s.check("suspendido: /my/org → 200", org.status === 200, org);
  const notice = await api("POST", "/my/subscription/payment-notice", { token: o.token, body: { reference: "TRX-SIM" } });
  s.check("suspendido: avisar pago → 2xx (AllowWhenRestricted)", notice.status < 300, notice);
  const ordersAfter = await ctx.prisma.providerOrder.count({ where: { tenantId: o.tenantId } });
  const offersAfter = await ctx.prisma.tenantProductOffer.count({ where: { tenantId: o.tenantId } });
  s.check("el comercio no pierde datos (pedidos y ofertas intactos)", ordersAfter === ordersBefore && offersAfter === offersBefore, { ordersBefore, ordersAfter, offersBefore, offersAfter });
  const cron = await ctx.prisma.subscription.findUnique({ where: { tenantId: o.tenantId } });
  s.note(`Estado guardado en la base tras vencer (sin cron): ${cron?.status}. El efectivo se calcula por fechas.`);
  const memberLogin = ctx.seller?.token ? await api("GET", "/my/org", { token: ctx.seller.token }) : null;
  if (memberLogin) s.note(`Miembro quitado, con la org suspendida: /my/org → ${memberLogin.status}`);

  // Reactivación por el superadmin.
  const pay = await api("POST", `/admin/subscriptions/${o.tenantId}/payments`, { token: ctx.admin.token, body: { amount: 60, months: 1, provider: "TRANSFER" } });
  s.note(`Superadmin registra un pago: ${pay.status} ${pay.body?.message ?? ""}`);
  if (pay.status < 300) {
    const back = await api("GET", "/my/subscription", { token: o.token });
    s.check("después del pago vuelve a FULL", back.data?.access === "FULL", { status: back.data?.status, access: back.data?.access });
    const w3 = await api("PUT", "/cart/org", { token: o.token, body: { items: ctx.cartItems } });
    s.check("después del pago vuelve a escribir", w3.status === 200, w3);
  }
}
