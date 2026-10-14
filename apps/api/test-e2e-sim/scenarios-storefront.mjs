// Escenarios V1–V9: Vender en NODO (docs/PLAN_VENDER_EN_NODO.md).
// Un comercio abre su tienda, publica por planilla y a mano, otros comercios la
// ven en el buscador y le hacen pedidos; vencimiento de stock, pausa, moderación
// y la solicitud para ser distribuidor o marca. Todo contra el API local.
import { api, scenario, sleep } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";

const DAY = 86_400_000;

function csv(prefix) {
  const rows = [
    ["Codigo", "Descripcion", "Marca", "Categoria", "Precio", "IVA", "Stock", "Moneda"],
    ["TGS-001", `Placa Usada ${prefix} RTX 3060`, "ASUS", "Placas de video", "180.00", "21", "3", "USD"],
    ["TGS-002", `Gabinete Propio ${prefix} Vidrio`, "TGS Gaming", "Gabinetes", "45.00", "21", "10", "USD"],
    ["TGS-003", `Mouse Sobrante ${prefix} Gamer`, "Redragon", "Perifericos", "12.00", "21", "6", "USD"],
    ["TGS-004", `Teclado Sobrante ${prefix} TKL`, "Redragon", "Perifericos", "25.00", "21", "0", "USD"],
    ["TGS-005", `Fuente Usada ${prefix} 650W`, "Thermaltake", "Fuentes", "40.00", "21", "2", "USD"],
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

/** Comercio nuevo con dueño, en prueba de Pro. */
async function retailer(ctx, suffix, name) {
  const u = await registerVerified(ctx, suffix);
  const boot = await api("POST", "/onboarding/bootstrap", { token: u.token, body: { name, trialPlan: "PRO" } });
  if (boot.status !== 201) throw new Error(`bootstrap ${name}: ${boot.status} ${JSON.stringify(boot.body)}`);
  return { ...u, token: boot.data.token, tenantId: boot.data.org.id, name };
}

async function uploadCsv(s, token, providerKey, text, label) {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/csv" }), `${label}.csv`);
  const up = await api("POST", `/providers/${providerKey}/imports`, { token, form });
  s.check(`${label}: subir planilla → 201`, up.status === 201 && up.data?.id, up);
  const id = up.data?.id;
  if (!id) return null;
  let rec = up;
  for (let i = 0; i < 80 && rec.data?.status === "PROCESSING"; i++) {
    await sleep(500);
    rec = await api("GET", `/providers/${providerKey}/imports/${id}`, { token });
  }
  if (rec.data?.status === "NEEDS_REVIEW") {
    s.note(`${label}: quedó en revisión (${JSON.stringify(rec.data?.reviewReasons ?? []).slice(0, 200)}); se aplica`);
    rec = await api("POST", `/providers/${providerKey}/imports/${id}/apply`, { token });
    for (let i = 0; i < 80 && rec.data?.status !== "APPLIED" && rec.data?.status !== "FAILED"; i++) {
      await sleep(500);
      rec = await api("GET", `/providers/${providerKey}/imports/${id}`, { token });
    }
  }
  s.check(`${label}: queda APPLIED`, rec.data?.status === "APPLIED", { status: rec.data?.status, error: rec.data?.error });
  return rec.data;
}

/** El evento "list.applied" es asíncrono: espera a que la tienda confirme el stock. */
async function waitFor(fn, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

const providersOf = async (token) => {
  const r = await api("GET", "/my/providers", { token });
  return Array.isArray(r.data) ? r.data : [];
};

async function v1Open(ctx) {
  const s = scenario("V1", "Abrir la tienda");
  ctx.sf = {
    seller: await retailer(ctx, "sfs", `TGS Sim ${ctx.stamp}`),
    buyer: await retailer(ctx, "sfb", `Compras Sim ${ctx.stamp}`),
    third: await retailer(ctx, "sfc", `Tercero Sim ${ctx.stamp}`),
  };
  const { seller, buyer, third } = ctx.sf;

  const none = await api("GET", "/my/storefront", { token: seller.token });
  s.check("sin tienda → exists:false", none.status === 200 && none.data?.exists === false, none);
  const open = await api("POST", "/my/storefront", { token: seller.token, body: { contactPhone: "11 5555-0000", contactNote: "Retiro en Palermo" } });
  s.check("abrir → 201 con clave LIST_ y activa", open.status === 201 && open.data?.exists && /^LIST_/.test(open.data.provider) && open.data.status === "ACTIVE", open);
  s.check("recién abierta no se ve (sin stock confirmado)", open.data?.visible === false && open.data?.hiddenReason === "NO_STOCK_CONFIRMED", open.data);
  s.check("se muestra con el nombre del comercio", open.data?.name === seller.name, open.data);
  ctx.sf.key = open.data?.provider;
  ctx.sf.id = open.data?.id;
  const again = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("abrir de nuevo es idempotente (misma tienda)", again.status === 201 && again.data?.id === ctx.sf.id, again);

  const supplier = await ctx.prisma.tenant.findUnique({ where: { providerKey: ctx.sf.key } });
  s.check("la organización proveedora no repite el nombre del comercio", supplier && supplier.name !== seller.name && supplier.type === "DISTRIBUTOR", supplier);
  ctx.sf.supplierId = supplier?.id;
  const links = await ctx.prisma.tenantLink.findMany({ where: { supplierTenantId: supplier?.id } });
  const byClient = new Map(links.map((l) => [l.clientTenantId, l.status]));
  s.check("vinculada por lista con el comprador y el tercero", byClient.get(buyer.tenantId) === "LIST_CONNECTED" && byClient.get(third.tenantId) === "LIST_CONNECTED", Object.fromEntries(byClient));
  s.check("sin vínculo con su propio comercio", !byClient.has(seller.tenantId), { has: byClient.has(seller.tenantId) });

  const dir = await api("GET", `/my/suppliers/search?q=${encodeURIComponent(seller.name)}`, { token: buyer.token });
  s.check("no aparece en el directorio de 'Agregar proveedor'", dir.status === 200 && !(dir.data ?? []).some((r) => r.providerKey === ctx.sf.key), dir);
  const thirdMine = await api("GET", "/my/storefront", { token: third.token });
  s.check("otro comercio no ve la tienda ajena como propia", thirdMine.data?.exists === false, thirdMine);
  const hijack = await api("POST", "/my/storefront/products", { token: third.token, body: { name: "x", price: 1, currency: "USD", stock: 1 } });
  s.check("otro comercio no puede cargarle productos (404 sin tienda propia)", hijack.status === 404, hijack);
  const notYet = (await providersOf(buyer.token)).find((p) => p.provider === ctx.sf.key);
  s.check("el comprador todavía no la ve (sin stock confirmado)", !notYet, notYet);
}

async function v2Publish(ctx) {
  const s = scenario("V2", "Publicar por planilla y que la vean");
  const { seller, buyer, third, key } = ctx.sf;
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla de la tienda");
  const mine = await waitFor(async () => {
    const r = await api("GET", "/my/storefront", { token: seller.token });
    return r.data?.stockConfirmedAt ? r : null;
  });
  s.check("subir la planilla confirma el stock y la tienda queda visible", mine?.data?.visible === true && mine.data.productCount === 5 && mine.data.inStockCount === 4, mine?.data);

  const seen = (await providersOf(buyer.token)).find((p) => p.provider === key);
  s.check("el comprador la ve como tienda, con el nombre del comercio", seen?.storefront === true && seen.name === seller.name, seen);
  s.check("busca, está configurada y sin chat ni vendedor", seen?.inSearch === true && seen.configured === true && seen.linkId === null && seen.accountManager === null, seen);
  s.check("el tercero también la ve", Boolean((await providersOf(third.token)).find((p) => p.provider === key)), null);
  s.check("el dueño no ve su propia tienda en sus proveedores", !(await providersOf(seller.token)).some((p) => p.provider === key), null);

  const search = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("placa usada")}`, { token: buyer.token });
  const hit = (search.data ?? []).find((p) => /Placa Usada/.test(p.name ?? ""));
  s.check("búsqueda del comprador encuentra el producto de la tienda", search.status === 200 && Boolean(hit), { status: search.status, n: search.data?.length });
  const oos = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("teclado sobrante")}`, { token: buyer.token });
  s.check("lo que tiene stock 0 no aparece", oos.status === 200 && (oos.data ?? []).length === 0, oos.data);
  const brands = await api("GET", "/catalog/brands", { token: buyer.token });
  const brandNames = JSON.stringify(brands.data ?? []);
  s.check("la marca propia de la tienda entra al filtro de marcas", /TGS Gaming/i.test(brandNames), brandNames.slice(0, 400));

  const steal = await api("POST", `/providers/${key}/imports`, { token: buyer.token, form: (() => { const f = new FormData(); f.append("file", new Blob([csv("x")], { type: "text/csv" }), "x.csv"); return f; })() });
  s.check("el comprador no puede cargarle una lista a la tienda (403)", steal.status === 403, steal);
  const fresh = await api("GET", `/providers/${key}/freshness`, { token: buyer.token });
  s.check("el comprador puede leer las fechas de la lista (lo usa el buscador)", fresh.status === 200, fresh);
  const imports = await api("GET", `/providers/${key}/imports`, { token: buyer.token });
  s.check("el comprador no ve el historial de cargas de la tienda", imports.status === 403 || imports.status === 404, imports);
  const apiOverview = await api("GET", "/my/catalog-api", { token: buyer.token });
  s.check(
    "la API de catálogo del comprador no reexporta la tienda de otro local",
    apiOverview.status === 200 && Array.isArray(apiOverview.data?.providers) && !apiOverview.data.providers.some((p) => p.key === key),
    { status: apiOverview.status, providers: apiOverview.data?.providers }
  );
  const sellerSearch = await api("GET", `/search/provider/${key}?name=placa`, { token: seller.token });
  s.check("el dueño no busca en su propia tienda", sellerSearch.status === 200 && (sellerSearch.data ?? []).length === 0, sellerSearch.data);
}

async function v3Manual(ctx) {
  const s = scenario("V3", "Carga y edición manual");
  const { seller, buyer, key } = ctx.sf;
  const add = await api("POST", "/my/storefront/products", {
    token: seller.token,
    body: { name: `Placa Propia ${ctx.prefix} Edición TGS`, brand: "MarcaPropia TGS", category: "Placas de video", price: 100, currency: "USD", ivaPercent: 21, stock: 5 },
  });
  s.check("cargar un producto → 201", add.status === 201 && /^M-/.test(add.data?.externalId ?? ""), add);
  ctx.sf.manualId = add.data?.externalId;
  const bad = [
    { name: "", price: 1, currency: "USD", stock: 1 },
    { name: "x", price: 0, currency: "USD", stock: 1 },
    { name: "x", price: 1, currency: "EUR", stock: 1 },
    { name: "x", price: 1, currency: "USD", stock: -1 },
    { name: "x", price: 1, currency: "USD", stock: 1.5 },
    { name: "x", price: 1, currency: "USD", stock: 1, ivaPercent: 15 },
  ];
  for (const body of bad) {
    const r = await api("POST", "/my/storefront/products", { token: seller.token, body });
    s.check(`dato inválido ${JSON.stringify(body)} → 400`, r.status === 400, r);
  }
  const found = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("placa propia")}`, { token: buyer.token });
  const p = (found.data ?? [])[0];
  s.check("el comprador lo encuentra al toque", found.status === 200 && Boolean(p), found.data);
  s.check("con neto 100 y final 121", p && Number(p.price) === 100 && Number(p.finalPrice) === 121, p && { price: p.price, finalPrice: p.finalPrice });

  const upd = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: seller.token, body: { price: 90, stock: 4 } });
  s.check("editar precio y stock → 200", upd.status === 200, upd);
  const after = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("placa propia")}`, { token: buyer.token });
  const p2 = (after.data ?? [])[0];
  s.check("el comprador ve el precio nuevo", p2 && Number(p2.price) === 90 && Number(p2.finalPrice) === 108.9, p2 && { price: p2.price, finalPrice: p2.finalPrice, stock: p2.stock });
  const list = await api("GET", "/my/storefront/products?q=propia", { token: seller.token });
  s.check("buscar en la tienda propia", list.status === 200 && list.data?.items?.length === 1 && list.data.items[0].manual === true, list.data);
  const ghost = await api("PUT", "/my/storefront/products/NO-EXISTE", { token: seller.token, body: { stock: 1 } });
  s.check("editar algo que no está → 404", ghost.status === 404, ghost);
  const otherEdit = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: buyer.token, body: { price: 1 } });
  s.check("otro comercio no puede editarlo", otherEdit.status === 404, otherEdit);
}

function orderBody(key, item, qty, notes) {
  return { orders: [{ provider: key, notes, items: [{ externalId: item.externalId, name: item.name, qty, unitPrice: Number(item.price), ivaPercent: 21, pricingMode: "list" }] }] };
}

async function v4Orders(ctx) {
  const s = scenario("V4", "Pedidos a la tienda");
  const { seller, buyer, third, key } = ctx.sf;
  const found = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("placa propia")}`, { token: buyer.token });
  const item = (found.data ?? [])[0];
  if (!item) return s.check("hay producto para pedir", false, found);

  const tooMany = await api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, item, 9, "de más") });
  s.check("pedir más de lo publicado → 400 con mensaje claro", tooMany.status === 400 && /pediste 9/.test(JSON.stringify(tooMany.body)), tooMany);
  const ghost = await api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, { ...item, externalId: "NO-EXISTE" }, 1, "fantasma") });
  s.check("pedir algo que la tienda ya no tiene → 400", ghost.status === 400, ghost);

  const notifBefore = await ctx.prisma.orgNotification.count({ where: { toTenantId: seller.tenantId } });
  const ord = await api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, item, 2, `Pedido sim ${ctx.prefix}`) });
  const row = Array.isArray(ord.data) ? ord.data[0] : null;
  s.check("el comprador pide → 201 a confirmar por la tienda", ord.status === 201 && row?.storefrontStatus === "PENDING" && row.editable === false, ord);
  ctx.sf.orderId = row?.id;
  const notified = await waitFor(async () => (await ctx.prisma.orgNotification.count({ where: { toTenantId: seller.tenantId } })) > notifBefore);
  s.check("a la tienda le llega el aviso del pedido", Boolean(notified), null);
  const pend = await api("GET", "/my/storefront/orders?status=PENDING", { token: seller.token });
  const mineRow = (pend.data ?? []).find((o) => o.id === row?.id);
  s.check("la tienda lo ve con los datos del comprador", mineRow?.buyer?.name === buyer.name && mineRow.items?.[0]?.qty === 2 && mineRow.items[0].stockNow === 4, mineRow);
  const sfView = await api("GET", "/my/storefront", { token: seller.token });
  s.check("el resumen cuenta 1 pendiente", sfView.data?.pendingOrders === 1, sfView.data);

  const thirdResp = await api("POST", `/my/storefront/orders/${row?.id}/respond`, { token: third.token, body: { action: "CONFIRM" } });
  s.check("un tercero no puede responder el pedido", thirdResp.status === 404, thirdResp);
  const buyerResp = await api("POST", `/my/storefront/orders/${row?.id}/respond`, { token: buyer.token, body: { action: "CONFIRM" } });
  s.check("el comprador no puede confirmarse su propio pedido", buyerResp.status === 404, buyerResp);
  const edit = await api("PATCH", `/orders/${row?.id}`, { token: buyer.token, body: { notes: "cambio" } });
  s.check("el comprador no puede editar un pedido a una tienda", edit.status === 400, edit);
  const noReason = await api("POST", `/my/storefront/orders/${row?.id}/respond`, { token: seller.token, body: { action: "REJECT" } });
  s.check("rechazar sin motivo → 400", noReason.status === 400, noReason);

  const ok = await api("POST", `/my/storefront/orders/${row?.id}/respond`, { token: seller.token, body: { action: "CONFIRM", note: "Pasá mañana" } });
  s.check("la tienda confirma → CONFIRMED", ok.status === 201 && ok.data?.status === "CONFIRMED", ok);
  const base = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, externalId: item.externalId } });
  s.check("confirmar descuenta el stock publicado (4 → 2)", base?.stock === 2, base);
  const buyerOffer = await ctx.prisma.tenantProductOffer.findFirst({ where: { tenantId: buyer.tenantId, provider: key, externalId: item.externalId } });
  s.check("el comprador ve el stock nuevo", buyerOffer?.stock === 2, buyerOffer && { stock: buyerOffer.stock });
  const twice = await api("POST", `/my/storefront/orders/${row?.id}/respond`, { token: seller.token, body: { action: "REJECT", note: "x" } });
  s.check("responder dos veces → 409", twice.status === 409, twice);
  const cancelDone = await api("POST", `/my/storefront-purchases/${row?.id}/cancel`, { token: buyer.token });
  s.check("no se cancela lo ya confirmado → 409", cancelDone.status === 409, cancelDone);
  const orders = await api("GET", "/orders", { token: buyer.token });
  const mine = (Array.isArray(orders.data) ? orders.data : []).find((o) => o.id === row?.id);
  s.check("en Pedidos del comprador figura confirmado con la nota", mine?.storefrontStatus === "CONFIRMED" && mine.storefrontNote === "Pasá mañana", mine);
  const buyerNotif = await ctx.prisma.orgNotification.findFirst({ where: { toTenantId: buyer.tenantId, landingKey: `storefront-purchase:${row?.id}` } });
  s.check("al comprador le llega el aviso de confirmación", Boolean(buyerNotif), buyerNotif);

  const o2 = await api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, item, 1, "para cancelar") });
  const id2 = o2.data?.[0]?.id;
  const cancel = await api("POST", `/my/storefront-purchases/${id2}/cancel`, { token: buyer.token });
  s.check("el comprador cancela mientras está pendiente", cancel.status === 201 && cancel.data?.status === "CANCELLED", cancel);
  const thirdCancel = await api("POST", `/my/storefront-purchases/${ctx.sf.orderId}/cancel`, { token: third.token });
  s.check("un tercero no cancela pedidos ajenos", thirdCancel.status === 404, thirdCancel);
  const stockAfterCancel = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, externalId: item.externalId } });
  s.check("cancelar no toca el stock", stockAfterCancel?.stock === 2, stockAfterCancel);

  const o3 = await api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, item, 1, "para rechazar") });
  const id3 = o3.data?.[0]?.id;
  const rej = await api("POST", `/my/storefront/orders/${id3}/respond`, { token: seller.token, body: { action: "REJECT", note: "Se vendió en el local" } });
  s.check("la tienda rechaza con motivo", rej.status === 201 && rej.data?.status === "REJECTED", rej);
  const stockAfterReject = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, externalId: item.externalId } });
  s.check("rechazar no toca el stock", stockAfterReject?.stock === 2, stockAfterReject);
  const rejList = await api("GET", "/my/storefront/orders?status=REJECTED", { token: seller.token });
  s.check("filtro por estado de la tienda", (rejList.data ?? []).length === 1 && rejList.data[0].note === "Se vendió en el local", rejList.data);

  const own = await api("POST", "/orders/offline", { token: seller.token, body: orderBody(key, item, 1, "a mí mismo") });
  s.check("el dueño no puede pedirse a su propia tienda", own.status >= 400 && own.status < 500, own);
}

async function v5Approval(ctx) {
  const s = scenario("V5", "Pedido con aprobación interna del comprador");
  const { seller, buyer, key } = ctx.sf;
  const member = await api("POST", "/my/team", {
    token: buyer.token,
    body: { username: `${ctx.prefix}-sfv`, email: `${ctx.prefix}-sfv@sim.nodo.test`, password: "Sim-Vend-Pass1!", role: "BUYER" },
  });
  if (member.status !== 201) return s.note(`no se pudo crear el comprador del equipo (${member.status}); se saltea`, member);
  await ctx.prisma.tenantRolePermission
    .upsert({
      where: { tenantId_role_permission: { tenantId: buyer.tenantId, role: "BUYER", permission: "orders.confirm" } },
      create: { tenantId: buyer.tenantId, role: "BUYER", permission: "orders.confirm", allowed: false },
      update: { allowed: false },
    })
    .catch((err) => s.note(`no se pudo quitar orders.confirm: ${err.message}`));
  const login = await api("POST", "/auth/login", { body: { username: `${ctx.prefix}-sfv`, password: "Sim-Vend-Pass1!" } });
  if (login.status !== 200) return s.note(`login del comprador del equipo: ${login.status}`, login);
  await sleep(31_000); // caché de permisos de la sesión
  const found = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("mouse sobrante")}`, { token: login.data.token });
  const item = (found.data ?? [])[0];
  if (!item) return s.check("el comprador del equipo ve la tienda", false, found);
  const ord = await api("POST", "/orders/offline", { token: login.data.token, body: orderBody(key, item, 1, "con aprobación") });
  const row = ord.data?.[0];
  s.check("queda esperando aprobación del dueño", ord.status === 201 && row?.approvalStatus === "PENDING_APPROVAL" && row.storefrontStatus === "PENDING", ord);
  const before = await api("GET", "/my/storefront/orders?status=PENDING", { token: seller.token });
  s.check("la tienda todavía no lo ve", !(before.data ?? []).some((o) => o.id === row?.id), before.data?.map((o) => o.id));
  const approve = await api("POST", `/orders/${row?.id}/approve`, { token: buyer.token });
  s.check("el dueño del comprador lo aprueba", approve.status < 300, approve);
  const after = await waitFor(async () => {
    const r = await api("GET", "/my/storefront/orders?status=PENDING", { token: seller.token });
    return (r.data ?? []).some((o) => o.id === row?.id) ? r : null;
  });
  s.check("recién aprobado le llega a la tienda", Boolean(after), null);
  const notif = await waitFor(() => ctx.prisma.orgNotification.findFirst({ where: { toTenantId: seller.tenantId, landingKey: `storefront-order:${row?.id}` } }));
  s.check("con aviso a la tienda", Boolean(notif), null);
  await api("POST", `/my/storefront/orders/${row?.id}/respond`, { token: seller.token, body: { action: "REJECT", note: "fin de prueba" } });
}

async function v6Visibility(ctx) {
  const s = scenario("V6", "Vencimiento de stock, pausa y moderación");
  const { seller, buyer, key, id } = ctx.sf;
  const visible = async () => Boolean((await providersOf(buyer.token)).find((p) => p.provider === key));

  await ctx.prisma.storefront.update({ where: { id }, data: { stockConfirmedAt: new Date(Date.now() - 4 * DAY) } });
  s.check("stock vencido: el comprador deja de verla", !(await visible()), null);
  const search = await api("GET", `/search/provider/${key}?name=mouse`, { token: buyer.token });
  s.check("y la búsqueda no devuelve nada", search.status === 200 && (search.data ?? []).length === 0, search.data);
  const item = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, stock: { gt: 0 } } });
  const ord = await api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, { externalId: item.externalId, name: "x", price: 1 }, 1, "vencida") });
  s.check("no se le puede pedir con el stock vencido", ord.status >= 400 && ord.status < 500, ord);
  const mine = await api("GET", "/my/storefront", { token: seller.token });
  s.check("el dueño ve el motivo", mine.data?.hiddenReason === "STOCK_EXPIRED" && mine.data.visible === false, mine.data);
  const conf = await api("POST", "/my/storefront/confirm-stock", { token: seller.token });
  s.check("confirmar stock la vuelve a mostrar", conf.status === 201 && conf.data?.visible === true && (await visible()), conf.data);

  const pause = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "PAUSED" } });
  s.check("pausar → no se ve", pause.status === 200 && pause.data?.hiddenReason === "PAUSED" && !(await visible()), pause.data);
  const resume = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "ACTIVE" } });
  s.check("reactivar → se ve", resume.status === 200 && (await visible()), resume.data);

  const noReason = await api("PUT", `/admin/storefronts/${id}/status`, { token: ctx.admin.token, body: { status: "SUSPENDED" } });
  s.check("frenar sin motivo → 400", noReason.status === 400, noReason);
  const susp = await api("PUT", `/admin/storefronts/${id}/status`, { token: ctx.admin.token, body: { status: "SUSPENDED", reason: "Revisión de publicaciones" } });
  s.check("el superadmin la frena → no se ve", susp.status === 200 && !(await visible()), susp);
  const selfReactivate = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "ACTIVE" } });
  s.check("el dueño no puede reactivar una tienda frenada", selfReactivate.status === 403, selfReactivate);
  const reopen = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("ni abriéndola de nuevo", reopen.status === 403, reopen);
  const notAdmin = await api("PUT", `/admin/storefronts/${id}/status`, { token: buyer.token, body: { status: "ACTIVE" } });
  s.check("un comercio no puede usar la moderación", notAdmin.status === 403, notAdmin);
  const list = await api("GET", "/admin/storefronts", { token: ctx.admin.token });
  s.check("el superadmin ve la tienda en el listado", (list.data ?? []).some((r) => r.id === id && r.status === "SUSPENDED"), list.status);
  const back = await api("PUT", `/admin/storefronts/${id}/status`, { token: ctx.admin.token, body: { status: "ACTIVE" } });
  s.check("el superadmin la reactiva → se ve", back.status === 200 && (await visible()), back);
}

async function v7NewRetailer(ctx) {
  const s = scenario("V7", "Comercio nuevo y comercio que no quiere verla");
  const { seller, buyer, third, key } = ctx.sf;
  const late = await retailer(ctx, "sfd", `Nuevo Sim ${ctx.stamp}`);
  s.check("un comercio nuevo no la ve hasta que se sincronizan los vínculos", !(await providersOf(late.token)).some((p) => p.provider === key), null);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla otra vez (re-sincroniza vínculos)");
  const seen = await waitFor(async () => (await providersOf(late.token)).some((p) => p.provider === key));
  s.check("después de la sincronización la ve", Boolean(seen), null);
  const manual = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, externalId: ctx.sf.manualId } });
  s.check("la planilla nueva reemplaza todo: el producto cargado a mano se va", !manual, manual);

  const off = await api("PUT", `/my/providers/${key}/search`, { token: buyer.token, body: { enabled: false } });
  const row = (await providersOf(buyer.token)).find((p) => p.provider === key);
  s.check("el comprador puede sacarla de su búsqueda", off.status === 200 && row && row.inSearch === false, { status: off.status, row });
  const disc = await api("DELETE", `/my/providers/${key}`, { token: third.token });
  s.check("el tercero puede dejar de verla", disc.status === 200 && !(await providersOf(third.token)).some((p) => p.provider === key), disc);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla otra vez");
  await sleep(1000);
  s.check("y no reaparece sola aunque se re-sincronicen los vínculos", !(await providersOf(third.token)).some((p) => p.provider === key), null);
}

async function v8Upgrade(ctx) {
  const s = scenario("V8", "Convertite en distribuidor o marca");
  const { seller, buyer } = ctx.sf;
  const first = await api("POST", "/my/upgrade-requests", { token: seller.token, body: { kind: "BRAND", message: "Tenemos marca propia de gabinetes" } });
  s.check("pedir ser marca → 201 pendiente", first.status === 201 && first.data?.kind === "BRAND" && first.data.status === "PENDING", first);
  const again = await api("POST", "/my/upgrade-requests", { token: seller.token, body: { kind: "BRAND", message: "Actualizo el mensaje" } });
  s.check("pedirlo de nuevo no duplica", again.status === 201 && again.data?.id === first.data?.id && again.data.message === "Actualizo el mensaje", again);
  const dist = await api("POST", "/my/upgrade-requests", { token: seller.token, body: { kind: "DISTRIBUTOR" } });
  s.check("pedir ser distribuidor es otra solicitud", dist.status === 201 && dist.data?.id !== first.data?.id, dist);
  const inbox = await ctx.prisma.inboxRequest.findMany({ where: { tenantId: seller.tenantId, type: "SUPPLIER_JOIN" } });
  s.check("entran a la bandeja de Solicitudes del superadmin", inbox.length === 2, inbox.map((r) => r.title));
  const mine = await api("GET", "/my/upgrade-requests", { token: seller.token });
  s.check("el comercio ve lo que pidió", (mine.data ?? []).length === 2, mine.data);
  const bad = await api("POST", "/my/upgrade-requests", { token: buyer.token, body: { kind: "OTRA" } });
  s.check("tipo inválido → 400", bad.status === 400, bad);
  const others = await api("GET", "/my/upgrade-requests", { token: buyer.token });
  s.check("otro comercio no ve las solicitudes ajenas", Array.isArray(others.data) && others.data.length === 0, others.data);
}

async function v9Probes(ctx) {
  const s = scenario("V9", "Entradas raras: ningún 5xx");
  const { seller, buyer } = ctx.sf;
  const probes = [
    [seller.token, "POST", "/my/storefront/orders/no-es-uuid/respond", { action: "CONFIRM" }],
    [seller.token, "POST", `/my/storefront/orders/${ctx.sf.orderId}/respond`, { action: "OTRA" }],
    [seller.token, "GET", "/my/storefront/orders?status=NADA"],
    [seller.token, "PUT", "/my/storefront", { status: "SUSPENDED" }],
    [seller.token, "PUT", "/my/storefront", { contactPhone: "x".repeat(100) }],
    [seller.token, "POST", "/my/storefront/products", { name: "x".repeat(400), price: 1, currency: "USD", stock: 1 }],
    [seller.token, "POST", "/my/storefront/products", { name: "x", price: "abc", currency: "USD", stock: 1 }],
    [seller.token, "DELETE", "/my/storefront/products/%00"],
    [seller.token, "GET", `/my/storefront/products?q=${encodeURIComponent("%_%")}`],
    [buyer.token, "POST", "/my/storefront-purchases/no-es-uuid/cancel"],
    [buyer.token, "POST", "/my/storefront/confirm-stock"],
    [buyer.token, "GET", "/my/storefront/orders"],
    [null, "GET", "/my/storefront"],
    [ctx.admin.token, "PUT", "/admin/storefronts/no-es-uuid/status", { status: "ACTIVE" }],
  ];
  for (const [token, m, path, body] of probes) {
    const r = await api(m, path, { token: token ?? undefined, body });
    s.check(`${m} ${path.slice(0, 60)} → sin 5xx (${r.status})`, r.status < 500, r);
  }
}

export const storefrontScenarios = [v1Open, v2Publish, v3Manual, v4Orders, v5Approval, v6Visibility, v7NewRetailer, v8Upgrade, v9Probes];
