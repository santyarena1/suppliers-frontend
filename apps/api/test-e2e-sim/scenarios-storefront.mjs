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
  s.check("recién abierta no se ve (sin productos)", open.data?.visible === false && open.data?.hiddenReason === "NO_PRODUCTS", open.data);
  s.check("se muestra con el nombre del comercio", open.data?.name === seller.name, open.data);
  s.check(
    "arranca pública, con link de invitación, stock cada 3 días y sin ocultarse al vencer",
    open.data?.visibility === "PUBLIC" && /^[A-Za-z0-9_-]{20,}$/.test(open.data.inviteToken ?? "") && open.data.stockValidDays === 3 && open.data.staleAction === "KEEP",
    open.data
  );
  ctx.sf.key = open.data?.provider;
  ctx.sf.id = open.data?.id;
  const again = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("abrir de nuevo es idempotente (misma tienda)", again.status === 201 && again.data?.id === ctx.sf.id, again);

  const supplier = await ctx.prisma.tenant.findUnique({ where: { providerKey: ctx.sf.key } });
  s.check("la organización proveedora no repite el nombre del comercio", supplier && supplier.name !== seller.name && supplier.type === "DISTRIBUTOR", supplier);
  ctx.sf.supplierId = supplier?.id;
  const links = await ctx.prisma.tenantLink.count({ where: { supplierTenantId: supplier?.id } });
  const offered = await ctx.prisma.storefrontAudience.count({ where: { storefrontId: ctx.sf.id } });
  s.check("vacía, todavía no se le ofrece a nadie ni tiene vínculos", links === 0 && offered === 0, { links, offered });

  const dir = await api("GET", `/my/suppliers/search?q=${encodeURIComponent(seller.name)}`, { token: buyer.token });
  s.check("no aparece en el directorio de 'Agregar proveedor'", dir.status === 200 && !(dir.data ?? []).some((r) => r.providerKey === ctx.sf.key), dir);
  const thirdMine = await api("GET", "/my/storefront", { token: third.token });
  s.check("otro comercio no ve la tienda ajena como propia", thirdMine.data?.exists === false, thirdMine);
  const hijack = await api("POST", "/my/storefront/products", { token: third.token, body: { name: "x", price: 1, currency: "USD", stock: 1 } });
  s.check("otro comercio no puede cargarle productos (404 sin tienda propia)", hijack.status === 404, hijack);
  const notYet = (await providersOf(buyer.token)).find((p) => p.provider === ctx.sf.key);
  s.check("el comprador todavía no la ve", !notYet, notYet);
}

const offersOf = async (token) => {
  const r = await api("GET", "/my/storefront-offers", { token });
  return Array.isArray(r.data) ? r.data : [];
};

async function v2Publish(ctx) {
  const s = scenario("V2", "Publicar por planilla y que la vean");
  const { seller, buyer, third, key } = ctx.sf;
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla de la tienda");
  const mine = await waitFor(async () => {
    const r = await api("GET", "/my/storefront", { token: seller.token });
    return r.data?.stockConfirmedAt ? r : null;
  });
  s.check("subir la planilla confirma el stock y la tienda queda visible", mine?.data?.visible === true && mine.data.productCount === 5 && mine.data.inStockCount === 4, mine?.data);

  // Ya tiene algo para vender: se le ofrece a cada comercio, que elige si la ve.
  const offer = await waitFor(async () => (await offersOf(buyer.token)).find((o) => o.provider === key));
  s.check(
    "al comprador se le ofrece, pendiente, con el nombre y lo que vende",
    offer?.audienceStatus === "PENDING" && offer.name === seller.name && offer.productCount === 4 && offer.categories?.length > 0,
    offer
  );
  const notif = await ctx.prisma.orgNotification.findFirst({ where: { toTenantId: buyer.tenantId, landingKey: `storefront-offer:${ctx.sf.id}` } });
  s.check("con el aviso «está vendiendo en NODO»", /está vendiendo en NODO/.test(notif?.title ?? ""), notif);
  s.check("mientras no acepte, no la ve en su buscador", !(await providersOf(buyer.token)).some((p) => p.provider === key), null);
  const notMine = await api("POST", `/my/storefront-offers/${ctx.sf.id}`, { token: seller.token, body: { decision: "ACCEPT" } });
  s.check("el dueño no puede aceptarse su propia tienda", notMine.status === 404, notMine);
  const badDecision = await api("POST", `/my/storefront-offers/${ctx.sf.id}`, { token: buyer.token, body: { decision: "QUIZAS" } });
  s.check("decisión inválida → 400", badDecision.status === 400, badDecision);
  const accept = await api("POST", `/my/storefront-offers/${ctx.sf.id}`, { token: buyer.token, body: { decision: "ACCEPT" } });
  s.check("el comprador acepta verla", accept.status === 201 && accept.data?.audienceStatus === "ACCEPTED", accept);
  const thirdAccept = await api("POST", `/my/storefront-offers/${ctx.sf.id}`, { token: third.token, body: { decision: "ACCEPT" } });
  s.check("el tercero también", thirdAccept.status === 201, thirdAccept);
  const sfAfter = await api("GET", "/my/storefront", { token: seller.token });
  s.check("el dueño ve cuántos comercios la aceptaron", sfAfter.data?.reach === 2 && sfAfter.data.audience?.accepted === 2, sfAfter.data?.audience);

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

  // Fotos: el navegador las achica; el servidor valida el tipo real y las guarda como link.
  const upload = async (token, bytes, name) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "image/png" }), name);
    return api("POST", "/my/storefront/images", { token, form });
  };
  const up = await upload(seller.token, TINY_PNG, "placa.png");
  s.check("subir una foto → link /assets/<id>", up.status === 201 && /^\/assets\/[0-9a-f-]{36}$/.test(up.data?.url ?? ""), up);
  const up2 = await upload(seller.token, TINY_PNG, "placa-2.png");
  const fake = await upload(seller.token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), "x.png");
  s.check("un SVG disfrazado de PNG no entra", fake.status === 400, fake);
  const huge = await upload(seller.token, Buffer.concat([TINY_PNG, Buffer.alloc(1_600_000)]), "grande.png");
  s.check("una foto de más de 1,5 MB no entra", huge.status === 400, huge);
  const noStore = await upload(buyer.token, TINY_PNG, "ajena.png");
  s.check("sin tienda no se suben fotos", noStore.status === 404, noStore);
  ctx.sf.imageUrls = [up.data?.url, up2.data?.url];

  const rich = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, {
    token: seller.token,
    body: {
      images: [up.data?.url, up2.data?.url],
      condition: "OPEN_BOX",
      warranty: "6 meses en el local",
      description: "Caja abierta, probada. Con todos los accesorios.",
    },
  });
  s.check("guardar fotos, estado, garantía y descripción → 200", rich.status === 200, rich);
  const badCond = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: seller.token, body: { condition: "ROTO" } });
  s.check("estado inválido → 400", badCond.status === 400, badCond);
  const badImg = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: seller.token, body: { images: ["javascript:alert(1)"] } });
  s.check("foto que no es link https → 400", badImg.status === 400, badImg);
  const foreign = await ctx.prisma.storedAsset.create({
    data: { mimeType: "image/png", filename: "ajena.png", byteSize: TINY_PNG.length, data: TINY_PNG, ownerTenantId: buyer.tenantId, purpose: "storefront" },
  });
  const steal = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: seller.token, body: { images: [`/assets/${foreign.id}`] } });
  s.check("no puede usar fotos subidas por otro comercio", steal.status === 400, steal);
  await ctx.prisma.storedAsset.delete({ where: { id: foreign.id } });

  const listed = await api("GET", "/my/storefront/products?q=propia", { token: seller.token });
  const row = listed.data?.items?.[0];
  s.check(
    "la tienda ve el producto con sus fotos, estado, garantía y descripción",
    row?.images?.length === 2 && row.imageUrl === up.data?.url && row.condition === "OPEN_BOX" && row.warranty === "6 meses en el local" && /Caja abierta/.test(row.description ?? ""),
    row
  );
  const ficha = await api("GET", `/providers/${key}/products/${ctx.sf.manualId}`, { token: buyer.token });
  s.check("en la búsqueda del comprador la foto principal es la primera", ficha.status === 200 && ficha.data?.imageUrl === up.data?.url && /Caja abierta/.test(ficha.data?.description ?? ""), ficha.data && { imageUrl: ficha.data.imageUrl, description: ficha.data.description });
  const info = await api("GET", `/my/storefront-item?provider=${key}&externalId=${ctx.sf.manualId}`, { token: buyer.token });
  s.check(
    "la ficha del comprador trae todas las fotos, el estado y la garantía",
    info.status === 200 && info.data?.item?.images?.length === 2 && info.data.item.condition === "OPEN_BOX" && info.data.item.warranty === "6 meses en el local" && info.data.store?.name === seller.name,
    info
  );
  const img = await fetch(`${process.env.SIM_BASE_URL || "http://127.0.0.1:8091"}${up.data?.url}`);
  s.check("la foto se sirve sin sesión, con cache larga y sin ejecutar nada", img.status === 200 && /immutable/.test(img.headers.get("cache-control") ?? "") && img.headers.get("x-content-type-options") === "nosniff", { status: img.status });

  const drop = await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: seller.token, body: { images: [up.data?.url] } });
  s.check("sacar una foto → 200", drop.status === 200, drop);
  const stillThere = await ctx.prisma.storedAsset.count({ where: { id: up2.data?.url?.split("/").pop() } });
  s.check("la foto sacada recién subida no se borra al toque (por si está en otra pestaña)", stillThere === 1, { stillThere });
  await ctx.prisma.storedAsset.update({ where: { id: up2.data?.url?.split("/").pop() }, data: { createdAt: new Date(Date.now() - DAY) } });
  await api("PUT", `/my/storefront/products/${ctx.sf.manualId}`, { token: seller.token, body: { images: [up.data?.url] } });
  const gone = await ctx.prisma.storedAsset.count({ where: { id: up2.data?.url?.split("/").pop() } });
  const kept = await ctx.prisma.storedAsset.count({ where: { id: up.data?.url?.split("/").pop() } });
  s.check("una foto vieja que nadie usa se borra; la que se usa queda", gone === 0 && kept === 1, { gone, kept });
}

// PNG de 1×1 válido.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

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
  const s = scenario("V6", "Stock vencido, cerrar y reabrir, pausa y moderación");
  const { seller, buyer, key, id } = ctx.sf;
  const visible = async () => Boolean((await providersOf(buyer.token)).find((p) => p.provider === key));
  const item = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, stock: { gt: 0 } } });
  const tryOrder = (notes) =>
    api("POST", "/orders/offline", { token: buyer.token, body: orderBody(key, { externalId: item.externalId, name: "x", price: 1 }, 1, notes) });

  // Por defecto, vencer el stock no la esconde: el comprador ve que no está confirmado.
  await ctx.prisma.storefront.update({ where: { id }, data: { stockConfirmedAt: new Date(Date.now() - 4 * DAY) } });
  s.check("stock vencido (por defecto): el comprador la sigue viendo", await visible(), null);
  const info = await api("GET", `/my/storefront-item?provider=${key}&externalId=${item.externalId}`, { token: buyer.token });
  s.check("y en la ficha ve que el stock está sin confirmar", info.data?.store?.stockState === "EXPIRED", info.data?.store);
  const mineKeep = await api("GET", "/my/storefront", { token: seller.token });
  s.check("el dueño ve el stock vencido", mineKeep.data?.stockState === "EXPIRED" && mineKeep.data.visible === true, mineKeep.data);

  const hide = await api("PUT", "/my/storefront", { token: seller.token, body: { staleAction: "HIDE" } });
  s.check("si elige ocultarla al vencer, deja de verse", hide.status === 200 && hide.data?.hiddenReason === "STOCK_EXPIRED" && !(await visible()), hide.data);
  const search = await api("GET", `/search/provider/${key}?name=mouse`, { token: buyer.token });
  s.check("y la búsqueda no devuelve nada", search.status === 200 && (search.data ?? []).length === 0, search.data);
  const ord = await tryOrder("vencida");
  s.check("no se le puede pedir oculta", ord.status >= 400 && ord.status < 500, ord);
  const conf = await api("POST", "/my/storefront/confirm-stock", { token: seller.token });
  s.check("confirmar stock la vuelve a mostrar", conf.status === 201 && conf.data?.visible === true && conf.data.stockState === "FRESH" && (await visible()), conf.data);

  const days = await api("PUT", "/my/storefront", { token: seller.token, body: { stockValidDays: 7, staleAction: "KEEP" } });
  s.check("elige cada cuántos días confirmar (7)", days.status === 200 && days.data?.stockValidDays === 7 && days.data.staleAction === "KEEP", days.data);
  const never = await api("PUT", "/my/storefront", { token: seller.token, body: { stockValidDays: 0 } });
  s.check("o que no se lo pida nunca", never.status === 200 && never.data?.stockState === "NO_EXPIRY" && never.data.stockExpiresAt === null, never.data);
  for (const body of [{ stockValidDays: 5 }, { stockValidDays: -1 }, { staleAction: "BORRAR" }]) {
    const r = await api("PUT", "/my/storefront", { token: seller.token, body });
    s.check(`opción inválida ${JSON.stringify(body)} → 400`, r.status === 400, r);
  }
  await api("PUT", "/my/storefront", { token: seller.token, body: { stockValidDays: 3 } });

  const pause = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "PAUSED" } });
  s.check("pausar → no se ve", pause.status === 200 && pause.data?.hiddenReason === "PAUSED" && !(await visible()), pause.data);
  const resume = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "ACTIVE" } });
  s.check("reactivar → se ve", resume.status === 200 && (await visible()), resume.data);

  // Cerrar y reabrir las veces que quiera.
  const pending = await tryOrder("antes de cerrar");
  const pendingId = pending.data?.[0]?.id;
  s.check("hay un pedido pendiente antes de cerrar", pending.status === 201 && Boolean(pendingId), pending);
  const close = await api("POST", "/my/storefront/close", { token: seller.token, body: {} });
  s.check("cerrar la tienda → CLOSED y no se ve", close.status === 201 && close.data?.status === "CLOSED" && close.data.hiddenReason === "CLOSED" && !(await visible()), close.data);
  const rejected = await ctx.prisma.providerOrder.findUnique({ where: { id: pendingId } });
  s.check("los pedidos sin responder quedan rechazados («La tienda cerró»)", rejected?.storefrontStatus === "REJECTED" && /cerró/.test(rejected.storefrontNote ?? ""), rejected && { status: rejected.storefrontStatus, note: rejected.storefrontNote });
  const told = await ctx.prisma.orgNotification.findFirst({ where: { toTenantId: buyer.tenantId, landingKey: `storefront-purchase:${pendingId}` } });
  s.check("y al comprador se le avisa", Boolean(told), told);
  const closedOrder = await tryOrder("cerrada");
  s.check("cerrada no se le puede pedir", closedOrder.status >= 400 && closedOrder.status < 500, closedOrder);
  const pauseClosed = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "ACTIVE" } });
  s.check("cerrada no se reactiva con pausar/reactivar (409)", pauseClosed.status === 409, pauseClosed);
  const stillProducts = await ctx.prisma.supplierBaseOffer.count({ where: { provider: key } });
  s.check("cerrar sin borrar conserva los productos", stillProducts > 0, { stillProducts });
  const reopen1 = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("reabrir → activa y la vuelven a ver los que la aceptaron", reopen1.status === 201 && reopen1.data?.status === "ACTIVE" && (await visible()), reopen1.data);
  await api("POST", "/my/storefront/close", { token: seller.token, body: {} });
  const reopen2 = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("y otra vez (cerrar y abrir las veces que quiera)", reopen2.status === 201 && reopen2.data?.status === "ACTIVE" && reopen2.data.id === id && (await visible()), reopen2.data);

  const noReason = await api("PUT", `/admin/storefronts/${id}/status`, { token: ctx.admin.token, body: { status: "SUSPENDED" } });
  s.check("frenar sin motivo → 400", noReason.status === 400, noReason);
  const susp = await api("PUT", `/admin/storefronts/${id}/status`, { token: ctx.admin.token, body: { status: "SUSPENDED", reason: "Revisión de publicaciones" } });
  s.check("el superadmin la frena → no se ve", susp.status === 200 && !(await visible()), susp);
  const selfReactivate = await api("PUT", "/my/storefront", { token: seller.token, body: { status: "ACTIVE" } });
  s.check("el dueño no puede reactivar una tienda frenada", selfReactivate.status === 403, selfReactivate);
  const reopen = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("ni abriéndola de nuevo", reopen.status === 403, reopen);
  const closeSusp = await api("POST", "/my/storefront/close", { token: seller.token, body: {} });
  s.check("ni cerrándola para reabrirla", closeSusp.status === 403, closeSusp);
  const notAdmin = await api("PUT", `/admin/storefronts/${id}/status`, { token: buyer.token, body: { status: "ACTIVE" } });
  s.check("un comercio no puede usar la moderación", notAdmin.status === 403, notAdmin);
  const list = await api("GET", "/admin/storefronts", { token: ctx.admin.token });
  s.check("el superadmin ve la tienda en el listado", (list.data ?? []).some((r) => r.id === id && r.status === "SUSPENDED" && r.buyers === 2), list.data?.find?.((r) => r.id === id));
  const back = await api("PUT", `/admin/storefronts/${id}/status`, { token: ctx.admin.token, body: { status: "ACTIVE" } });
  s.check("el superadmin la reactiva → se ve", back.status === 200 && (await visible()), back);
}

async function v7NewRetailer(ctx) {
  const s = scenario("V7", "Comercio nuevo, rechazar y volver a aceptar");
  const { seller, buyer, third, key, id } = ctx.sf;
  const late = await retailer(ctx, "sfd", `Nuevo Sim ${ctx.stamp}`);
  ctx.sf.late = late;
  s.check("un comercio nuevo no la ve ni la tiene ofrecida hasta que se sincroniza", !(await offersOf(late.token)).some((o) => o.provider === key), null);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla otra vez (re-sincroniza)");
  const offered = await waitFor(async () => (await offersOf(late.token)).find((o) => o.provider === key && o.audienceStatus === "PENDING"));
  s.check("después de la sincronización se le ofrece", Boolean(offered), null);
  s.check("pero no la ve hasta aceptar", !(await providersOf(late.token)).some((p) => p.provider === key), null);
  const manual = await ctx.prisma.supplierBaseOffer.findFirst({ where: { provider: key, externalId: ctx.sf.manualId } });
  s.check("la planilla nueva reemplaza todo: el producto cargado a mano se va", !manual, manual);
  const keptItem = await ctx.prisma.storefrontItem.findFirst({ where: { storefrontId: id, externalId: ctx.sf.manualId } });
  s.check("sus fotos quedan guardadas por si vuelve (o se revierte la planilla)", keptItem?.images?.length === 1, keptItem);

  const decline = await api("POST", `/my/storefront-offers/${id}`, { token: late.token, body: { decision: "DECLINE" } });
  s.check("el comercio nuevo dice que no", decline.status === 201 && decline.data?.audienceStatus === "DECLINED" && !(await providersOf(late.token)).some((p) => p.provider === key), decline);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla otra vez");
  await sleep(800);
  const afterDecline = (await offersOf(late.token)).find((o) => o.provider === key);
  s.check("no se le vuelve a ofrecer: queda como rechazada en Configuración", afterDecline?.audienceStatus === "DECLINED", afterDecline);
  const change = await api("POST", `/my/storefront-offers/${id}`, { token: late.token, body: { decision: "ACCEPT" } });
  s.check("cambia de idea desde Configuración y la ve", change.status === 201 && (await waitFor(async () => (await providersOf(late.token)).some((p) => p.provider === key))), change);
  const lateSearch = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("placa usada")}`, { token: late.token });
  s.check("y la búsqueda le trae sus productos", lateSearch.status === 200 && (lateSearch.data ?? []).length > 0, lateSearch.data?.length);

  const off = await api("PUT", `/my/providers/${key}/search`, { token: buyer.token, body: { enabled: false } });
  const row = (await providersOf(buyer.token)).find((p) => p.provider === key);
  s.check("el comprador puede sacarla de su búsqueda sin dejar de verla", off.status === 200 && row && row.inSearch === false, { status: off.status, row });
  await api("PUT", `/my/providers/${key}/search`, { token: buyer.token, body: { enabled: true } });
  const disc = await api("DELETE", `/my/providers/${key}`, { token: third.token });
  s.check("el tercero deja de verla desde Proveedores", disc.status === 200 && !(await providersOf(third.token)).some((p) => p.provider === key), disc);
  const thirdOffer = (await offersOf(third.token)).find((o) => o.provider === key);
  s.check("y queda como rechazada (se puede volver a aceptar)", thirdOffer?.audienceStatus === "DECLINED", thirdOffer);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla otra vez");
  await sleep(1000);
  s.check("no reaparece sola aunque se re-sincronice", !(await providersOf(third.token)).some((p) => p.provider === key), null);
  const noPerm = await api("POST", `/my/storefront-offers/${id}`, { token: null, body: { decision: "ACCEPT" } });
  s.check("sin sesión no se decide nada", noPerm.status === 401, noPerm);
}

async function v10Profile(ctx) {
  const s = scenario("V10", "Nombre público y condiciones de venta");
  const { seller, buyer, key, id } = ctx.sf;
  for (const [name, why] of [
    ["Elit", "nombre de un distribuidor"],
    [buyer.name.toUpperCase(), "nombre de otro comercio"],
    ["N", "muy corto"],
    ["NODO", "nombre de NODO"],
  ]) {
    const r = await api("PUT", "/my/storefront", { token: seller.token, body: { displayName: name } });
    s.check(`nombre público rechazado (${why}) → 400`, r.status === 400, r);
  }
  const publicName = `Gamer Outlet ${ctx.stamp}`;
  const save = await api("PUT", "/my/storefront", {
    token: seller.token,
    body: {
      displayName: `  ${publicName}  `,
      about: "Usados y sobrantes de stock, probados.",
      paymentMethods: ["TRANSFER", "CASH", "INVENTADO"],
      deliveryOptions: ["PICKUP", "MOTO"],
      invoiceTypes: ["A", "B"],
      defaultWarranty: "3 meses en el local",
      salesTerms: "Seña del 30% para reservar. Sin cambios en usados.",
      sellsOffline: true,
    },
  });
  s.check(
    "guarda nombre público, presentación y condiciones (descarta lo que no existe)",
    save.status === 200 &&
      save.data?.name === publicName &&
      save.data.orgName === seller.name &&
      JSON.stringify(save.data.paymentMethods) === JSON.stringify(["CASH", "TRANSFER"]) &&
      save.data.deliveryOptions.length === 2 &&
      save.data.sellsOffline === true,
    save.data
  );
  const seen = (await providersOf(buyer.token)).find((p) => p.provider === key);
  s.check("el comprador la ve con el nombre público", seen?.name === publicName, seen);
  const info = await api("GET", `/my/storefront-item?provider=${key}&externalId=TGS-001`, { token: buyer.token });
  s.check(
    "y en la ficha ve las condiciones, la garantía y que también vende por fuera",
    info.status === 200 &&
      info.data?.store?.name === publicName &&
      info.data.store.defaultWarranty === "3 meses en el local" &&
      /Seña/.test(info.data.store.salesTerms ?? "") &&
      info.data.store.sellsOffline === true &&
      info.data.store.invoiceTypes.includes("A"),
    info.data?.store
  );
  const nobody = await retailer(ctx, "sfe", `Ajeno Sim ${ctx.stamp}`);
  const peek = await api("GET", `/my/storefront-item?provider=${key}&externalId=TGS-001`, { token: nobody.token });
  s.check("un comercio que no la aceptó no puede leer sus condiciones", peek.status === 404, peek);
  const fake = await api("GET", `/my/storefront-item?provider=ELIT&externalId=1`, { token: buyer.token });
  s.check("pedir condiciones de algo que no es tienda → 404", fake.status === 404, fake);

  const logo = await (async () => {
    const form = new FormData();
    form.append("file", new Blob([TINY_PNG], { type: "image/png" }), "logo.png");
    return api("POST", "/my/storefront/images", { token: seller.token, form });
  })();
  const setLogo = await api("PUT", "/my/storefront", { token: seller.token, body: { logoUrl: logo.data?.url } });
  const display = await ctx.prisma.providerDisplayConfig.findUnique({ where: { provider: key } });
  s.check("el logo de la tienda es su logo en todo NODO", setLogo.status === 200 && setLogo.data?.logoUrl === logo.data?.url && display?.logoUrl === logo.data?.url, { logo: setLogo.data?.logoUrl, display: display?.logoUrl });
  const extLogo = await api("PUT", "/my/storefront", { token: seller.token, body: { logoUrl: "https://evil.example/logo.svg" } });
  s.check("el logo tiene que estar subido a NODO", extLogo.status === 400, extLogo);
  const reset = await api("PUT", "/my/storefront", { token: seller.token, body: { displayName: null } });
  s.check("borrar el nombre público vuelve al del comercio", reset.status === 200 && reset.data?.name === seller.name && reset.data.displayName === null, reset.data);
  await api("PUT", "/my/storefront", { token: seller.token, body: { displayName: publicName } });
  const order = await ctx.prisma.orgNotification.findFirst({ where: { toTenantId: buyer.tenantId }, orderBy: { createdAt: "desc" } });
  s.note(`último aviso del comprador: ${order?.title}`);
  ctx.sf.publicName = publicName;
  void id;
}

async function v11Private(ctx) {
  const s = scenario("V11", "Tienda privada con link de invitación, y cerrar borrando todo");
  const { seller, buyer, key, id, late } = ctx.sf;
  const priv = await api("PUT", "/my/storefront", { token: seller.token, body: { visibility: "PRIVATE" } });
  s.check("pasar a privada → 200 con link", priv.status === 200 && priv.data?.visibility === "PRIVATE" && Boolean(priv.data.inviteToken), priv.data);
  const pendings = await ctx.prisma.storefrontAudience.count({ where: { storefrontId: id, status: "PENDING" } });
  s.check("se retiran las propuestas que nadie contestó", pendings === 0, { pendings });
  s.check("los que ya la veían la siguen viendo", (await providersOf(buyer.token)).some((p) => p.provider === key), null);

  const guest = await retailer(ctx, "sff", `Invitado Sim ${ctx.stamp}`);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla (privada)");
  await sleep(800);
  s.check("privada no se le ofrece a un comercio nuevo", !(await offersOf(guest.token)).some((o) => o.provider === key), null);
  const token = priv.data?.inviteToken;
  const preview = await api("GET", `/my/storefront-invites/${token}`, { token: guest.token });
  s.check("con el link ve quién es antes de aceptar", preview.status === 200 && preview.data?.name === ctx.sf.publicName && preview.data.canAccept === true && preview.data.open === true, preview.data);
  const ownPreview = await api("GET", `/my/storefront-invites/${token}`, { token: seller.token });
  s.check("el dueño abriendo su link ve que es la suya", ownPreview.status === 200 && ownPreview.data?.own === true && ownPreview.data.canAccept === false, ownPreview.data);
  const ownAccept = await api("POST", `/my/storefront-invites/${token}/accept`, { token: seller.token });
  s.check("el dueño no puede aceptarse a sí mismo", ownAccept.status === 400, ownAccept);
  const accept = await api("POST", `/my/storefront-invites/${token}/accept`, { token: guest.token });
  s.check("acepta con el link y la ve", accept.status === 201 && (await providersOf(guest.token)).some((p) => p.provider === key), accept);
  const notified = await ctx.prisma.orgNotification.findFirst({ where: { toTenantId: seller.tenantId, landingKey: "storefront:audience" } });
  s.check("a la tienda le avisan que entró alguien con su link", Boolean(notified), null);
  const aud = await api("GET", "/my/storefront/audience", { token: seller.token });
  const guestRow = (aud.data?.accepted ?? []).find((a) => a.tenantId === guest.tenantId);
  s.check("la tienda ve quiénes la ven y cómo entraron", aud.status === 200 && guestRow?.source === "INVITE", aud.data);
  const audBuyer = await api("GET", "/my/storefront/audience", { token: buyer.token });
  s.check("otro comercio no ve la lista de compradores ajena", audBuyer.status === 404, audBuyer);

  const rot = await api("POST", "/my/storefront/invite-link", { token: seller.token });
  s.check("link nuevo → distinto", rot.status === 201 && rot.data?.inviteToken && rot.data.inviteToken !== token, rot.data);
  const old = await api("GET", `/my/storefront-invites/${token}`, { token: late.token });
  s.check("el link viejo deja de servir", old.status === 404, old);
  for (const bad of ["x", "../../admin", "%00%00%00%00%00%00%00%00"]) {
    const r = await api("GET", `/my/storefront-invites/${encodeURIComponent(bad)}`, { token: guest.token });
    s.check(`link inventado (${bad}) → 404`, r.status === 404, r);
  }

  const remove = await api("DELETE", `/my/storefront/audience/${guest.tenantId}`, { token: seller.token });
  s.check("la tienda saca a un comercio → deja de verla", remove.status === 200 && !(await providersOf(guest.token)).some((p) => p.provider === key), remove);
  const reAccept = await api("POST", `/my/storefront-offers/${id}`, { token: guest.token, body: { decision: "ACCEPT" } });
  s.check("y no se puede volver a meter solo", reAccept.status === 404, reAccept);
  const withNew = await api("POST", `/my/storefront-invites/${rot.data?.inviteToken}/accept`, { token: guest.token });
  s.check("salvo que la tienda le pase el link de nuevo", withNew.status === 201 && (await providersOf(guest.token)).some((p) => p.provider === key), withNew);
  const removeGhost = await api("DELETE", `/my/storefront/audience/${seller.tenantId}`, { token: seller.token });
  s.check("sacar a quien no la ve → 404", removeGhost.status === 404, removeGhost);

  const pub = await api("PUT", "/my/storefront", { token: seller.token, body: { visibility: "PUBLIC" } });
  s.check("volver a pública", pub.status === 200 && pub.data?.visibility === "PUBLIC", pub.data);

  // Cerrar borrando todo: vuelve vacía al reabrir.
  const assetsBefore = await ctx.prisma.storedAsset.count({ where: { ownerTenantId: seller.tenantId, purpose: "storefront" } });
  const wipe = await api("POST", "/my/storefront/close", { token: seller.token, body: { deleteProducts: true } });
  const products = await ctx.prisma.supplierBaseOffer.count({ where: { provider: key } });
  const items = await ctx.prisma.storefrontItem.count({ where: { storefrontId: id } });
  const assetsAfter = await ctx.prisma.storedAsset.count({ where: { ownerTenantId: seller.tenantId, purpose: "storefront" } });
  s.check("cerrar borrando: sin productos ni fotos (queda el logo)", wipe.status === 201 && products === 0 && items === 0 && assetsAfter === 1, { products, items, assetsBefore, assetsAfter });
  const buyerOffers = await ctx.prisma.tenantProductOffer.count({ where: { tenantId: buyer.tenantId, provider: key, active: true } });
  s.check("al comprador no le queda nada de la tienda en la búsqueda", buyerOffers === 0, { buyerOffers });
  const reopen = await api("POST", "/my/storefront", { token: seller.token, body: {} });
  s.check("reabrir: activa y vacía, para cargar de nuevo", reopen.status === 201 && reopen.data?.status === "ACTIVE" && reopen.data.productCount === 0 && reopen.data.hiddenReason === "NO_PRODUCTS", reopen.data);
  await uploadCsv(s, seller.token, key, csv(ctx.prefix), "planilla al reabrir");
  const back = await waitFor(async () => (await providersOf(buyer.token)).some((p) => p.provider === key));
  s.check("con productos nuevos, los que la aceptaron la vuelven a ver", Boolean(back), null);
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
    [buyer.token, "POST", "/my/storefront-offers/no-es-uuid", { decision: "ACCEPT" }],
    [buyer.token, "POST", `/my/storefront-offers/${ctx.sf.id}`, {}],
    [buyer.token, "GET", "/my/storefront-item"],
    [buyer.token, "GET", `/my/storefront-item?provider=${"x".repeat(200)}&externalId=1`],
    [buyer.token, "POST", "/my/storefront-invites/%2e%2e/accept"],
    [seller.token, "PUT", "/my/storefront", { displayName: 123, paymentMethods: "CASH", sellsOffline: "si" }],
    [seller.token, "PUT", "/my/storefront", { visibility: "SECRETA" }],
    [seller.token, "PUT", "/my/storefront/products/TGS-001", { images: [1, 2] }],
    [seller.token, "PUT", "/my/storefront/products/TGS-001", { images: Array.from({ length: 20 }, () => "https://x.com/a.jpg") }],
    [seller.token, "POST", "/my/storefront/images"],
    [seller.token, "DELETE", "/my/storefront/audience/no-es-uuid"],
    [seller.token, "POST", "/my/storefront/close", { deleteProducts: "todo" }],
  ];
  for (const [token, m, path, body] of probes) {
    const r = await api(m, path, { token: token ?? undefined, body });
    s.check(`${m} ${path.slice(0, 60)} → sin 5xx (${r.status})`, r.status < 500, r);
  }
}

async function v12Sheets(ctx) {
  const s = scenario("V12", "Google Sheets (contra Google de verdad)");
  const { seller, buyer, key } = ctx.sf;
  const SAMPLE = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0";
  for (const [url, why] of [
    ["https://evil.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit", "otro sitio"],
    ["http://169.254.169.254/latest/meta-data", "red interna"],
    ["https://docs.google.com.evil.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", "dominio parecido"],
    ["javascript:alert(1)", "javascript:"],
    ["https://docs.google.com/spreadsheets/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit", "planilla inexistente o privada"],
  ]) {
    const r = await api("PUT", "/my/storefront/sheet", { token: seller.token, body: { url } });
    s.check(`link rechazado (${why}) → 400 con motivo`, r.status === 400 && typeof r.body?.message === "string", r);
  }
  const notMine = await api("PUT", "/my/storefront/sheet", { token: buyer.token, body: { url: SAMPLE } });
  s.check("sin tienda no se conecta nada", notMine.status === 404, notMine);
  const link = await api("PUT", "/my/storefront/sheet", { token: seller.token, body: { url: SAMPLE } });
  s.check("planilla pública real: se conecta y entra una carga", link.status === 200 && link.data?.changed === true && Boolean(link.data.importId) && link.data.store?.sheet?.url?.includes("1BxiMVs0"), link);
  const imp = await ctx.prisma.supplierListImport.findUnique({ where: { id: link.data?.importId ?? "00000000-0000-0000-0000-000000000000" } });
  s.check("la carga es de la tienda, la subió el dueño y es un CSV", imp?.provider === key && imp.originalFileName === "google-sheets.csv" && imp.uploadedByUserId === seller.userId, imp && { provider: imp.provider, by: imp.uploadedByUserId, file: imp.originalFileName });
  const again = await api("POST", "/my/storefront/sheet/sync", { token: seller.token });
  s.check("«Sincronizar ahora» dos veces seguidas → espera un minuto", again.status === 400, again);
  await ctx.prisma.storefront.update({ where: { id: ctx.sf.id }, data: { sheetCheckedAt: new Date(Date.now() - 120_000) } });
  // Mientras la carga anterior está en proceso o en revisión, no se apila otra.
  const waits = await api("POST", "/my/storefront/sheet/sync", { token: seller.token });
  s.check("no apila cargas mientras la anterior no terminó", waits.status === 201 && waits.data?.changed === false, waits);
  const info = await api("GET", `/my/storefront-item?provider=${key}&externalId=TGS-001`, { token: buyer.token });
  s.check("el comprador nunca ve el link de la planilla", !JSON.stringify(info.body ?? {}).includes("1BxiMVs0"), null);
  const providersBody = JSON.stringify((await api("GET", "/my/providers", { token: buyer.token })).body ?? {});
  s.check("ni en sus proveedores", !providersBody.includes("1BxiMVs0") && !providersBody.includes("inviteToken"), null);
  if (link.data?.importId) await api("POST", `/providers/${key}/imports/${link.data.importId}/discard`, { token: seller.token });
  const off = await api("DELETE", "/my/storefront/sheet", { token: seller.token });
  s.check("desconectar → sin planilla", off.status === 200 && off.data?.sheet === null, off.data);
}

async function v13Directory(ctx) {
  const s = scenario("V13", "Comercio nuevo: distribuidores para conectar");
  const fresh = await retailer(ctx, "sfg", `Recien Llegado ${ctx.stamp}`);
  const empty = await ctx.prisma.tenant.create({
    data: { name: `Sin Catalogo ${ctx.stamp}`, type: "DISTRIBUTOR", providerKey: `LIST_SIN_CATALOGO_${ctx.stamp}` },
  });
  const rows = await providersOf(fresh.token);
  const unlinked = rows.filter((r) => !r.linked);
  s.check("ve distribuidores para conectar (sin estar vinculado)", unlinked.length > 0, unlinked.map((r) => r.provider));
  const keys = unlinked.map((r) => r.provider);
  const withCache = await ctx.prisma.providerSyncCache.groupBy({ by: ["provider"], where: { provider: { in: keys } } });
  const cached = new Set(withCache.map((r) => r.provider));
  s.check("todos tienen catálogo obtenido por alguien", keys.every((k) => cached.has(k)), keys.filter((k) => !cached.has(k)));
  s.check("no aparece un distribuidor del que nadie obtuvo catálogo", !keys.includes(empty.providerKey), null);
  const stores = await ctx.prisma.storefront.findMany({ select: { supplierTenant: { select: { providerKey: true } } } });
  const storeKeys = new Set(stores.map((x) => x.supplierTenant.providerKey));
  s.check("nunca aparece la tienda de un local", !rows.some((r) => storeKeys.has(r.provider) && !r.storefront) && !unlinked.some((r) => storeKeys.has(r.provider)), rows.filter((r) => storeKeys.has(r.provider)));
  s.check("tampoco aparecen tiendas como conectadas sin aceptarlas", !rows.some((r) => r.storefront), rows.filter((r) => r.storefront).map((r) => r.provider));
  const listKey = keys.find((k) => k.startsWith("LIST_"));
  s.check("aparecen proveedores por lista (los que alguien subió)", Boolean(listKey), keys);
  // Los distribuidores demo del recorrido inicial sí traen productos de ejemplo: esos no cuentan.
  const offersBefore = await ctx.prisma.tenantProductOffer.count({ where: { tenantId: fresh.tenantId, active: true, NOT: { provider: { startsWith: "LIST_DEMO_" } } } });
  s.check("sin conectar nada no tiene productos (fuera de los demo del recorrido)", offersBefore === 0, { offersBefore });
  if (listKey) {
    const baseRows = await ctx.prisma.supplierBaseOffer.count({ where: { provider: listKey } });
    const conn = await api("POST", `/my/providers/${listKey}/connect-list`, { token: fresh.token });
    s.check("«Cargar mi lista» lo conecta por lista", conn.status === 201 && conn.data?.provider === listKey, conn);
    await sleep(800);
    const mine = await ctx.prisma.tenantProductOffer.count({ where: { tenantId: fresh.tenantId, provider: listKey, active: true } });
    s.check("y no le trae precios de otro comercio (solo la lista base pública, si la hay)", baseRows > 0 ? mine <= baseRows : mine === 0, { mine, baseRows });
    const row = (await providersOf(fresh.token)).find((r) => r.provider === listKey);
    s.check("queda conectado para subir su lista", row?.linked === true, row);
  }
  const storeKey = [...storeKeys][0];
  if (storeKey) {
    const viaList = await api("POST", `/my/providers/${storeKey}/connect-list`, { token: fresh.token });
    s.check("una tienda no se conecta por ese camino (404)", viaList.status === 404, viaList);
  }
  for (const bad of ["../../x", "elit", "%00"]) {
    const r = await api("POST", `/my/providers/${encodeURIComponent(bad)}/connect-list`, { token: fresh.token });
    s.check(`clave inválida (${bad}) → 4xx`, r.status >= 400 && r.status < 500, r);
  }
  await ctx.prisma.tenant.delete({ where: { id: empty.id } });
}

export const storefrontScenarios = [v1Open, v2Publish, v3Manual, v4Orders, v5Approval, v6Visibility, v7NewRetailer, v10Profile, v11Private, v12Sheets, v13Directory, v8Upgrade, v9Probes];
