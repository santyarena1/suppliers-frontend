// Escenarios Q1–Q6: presupuestos v2, márgenes por estado de las tiendas de
// locales, plantilla del PDF y búsqueda de fotos de las tiendas. Contra el API local.
import { api, scenario } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";

// PNG 1×1 válido (para el logo).
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function retailer(ctx, suffix, name) {
  const u = await registerVerified(ctx, suffix);
  const boot = await api("POST", "/onboarding/bootstrap", { token: u.token, body: { name, trialPlan: "PRO" } });
  if (boot.status !== 201) throw new Error(`bootstrap ${name}: ${boot.status} ${JSON.stringify(boot.body)}`);
  return { ...u, token: boot.data.token, tenantId: boot.data.org.id, name };
}

/** Un vendedor (rol SELLER, sin ver costos) en el equipo del comercio. */
async function sellerOf(ctx, owner, suffix) {
  const created = await api("POST", "/my/team/invite-codes", { token: owner.token, body: { role: "SELLER", maxUses: 1 } });
  const u = await registerVerified(ctx, suffix);
  const join = await api("POST", "/onboarding/join-team", { token: u.token, body: { code: created.data?.code } });
  if (!join.data?.token) throw new Error(`no entra el vendedor: ${JSON.stringify(join.body)}`);
  return { ...u, token: join.data.token };
}

const num = (v) => (v == null ? null : Number(v));
const round2 = (n) => Math.round(n * 100) / 100;

async function q1Setup(ctx) {
  const s = scenario("Q1", "Tienda con productos nuevos y usados, y un comercio que la acepta");
  const store = await retailer(ctx, "qst", `Local Usados ${ctx.stamp}`);
  const buyer = await retailer(ctx, "qby", `Compras Q ${ctx.stamp}`);
  const open = await api("POST", "/my/storefront", { token: store.token, body: { contactPhone: "11 4444-0000" } });
  s.check("abre la tienda", open.status === 201 && /^LIST_/.test(open.data?.provider ?? ""), open);
  const key = open.data?.provider;
  const products = [
    { name: `Notebook Nueva ${ctx.prefix}`, category: "Notebooks", condition: "NEW" },
    { name: `Notebook Usada ${ctx.prefix}`, category: "Notebooks", condition: "USED" },
    { name: `Monitor Caja Abierta ${ctx.prefix}`, category: "Monitores", condition: "OPEN_BOX" },
  ];
  const ids = [];
  for (const p of products) {
    const r = await api("POST", "/my/storefront/products", { token: store.token, body: { ...p, brand: "SimBrand", price: 100, currency: "USD", ivaPercent: 21, stock: 3 } });
    s.check(`publica «${p.name.split(" ").slice(0, 2).join(" ")}» (${p.condition})`, r.status === 201, r);
    ids.push(r.data?.externalId);
  }
  const offers = await api("GET", "/my/storefront-offers", { token: buyer.token });
  const offer = (offers.data ?? []).find((o) => o.provider === key);
  s.check("al comprador le aparece la propuesta", offer?.audienceStatus === "PENDING", offers.data);
  const acc = await api("POST", `/my/storefront-offers/${offer?.storefrontId}`, { token: buyer.token, body: { decision: "ACCEPT" } });
  s.check("la acepta", acc.status === 200 || acc.status === 201, acc);
  const seller = await sellerOf(ctx, buyer, "qsl");
  ctx.q = { store, buyer, seller, key, ids, storefrontId: offer?.storefrontId };
}

async function q2Conditions(ctx) {
  const s = scenario("Q2", "Márgenes por estado (tiendas de locales)");
  const { buyer, seller, key, ids } = ctx.q;
  const quote = await api("POST", "/my/quotes", { token: buyer.token, body: { clientName: "Cliente Costo" } });
  const added = await api("POST", `/my/quotes/${quote.data?.id}/items`, { token: buyer.token, body: { provider: key, externalId: ids[1], qty: 1 } });
  s.check("sin márgenes, el presupuesto avisa que va al costo", added.status === 201 && added.data?.atCostLines === 1 && added.data.items[0].marginSource === "none", added.data);
  ctx.q.atCostQuote = quote.data?.id;

  const before = await api("GET", `/providers/${key}/sale-margins`, { token: buyer.token });
  const conds = before.data?.conditions ?? [];
  s.check(
    "la tienda trae los 4 estados con sus productos",
    before.status === 200 && conds.length === 4 && conds.find((c) => c.condition === "USED")?.products === 1 && conds.find((c) => c.condition === "NEW")?.products === 1,
    before.data
  );
  const prov = await api("PUT", `/providers/${key}/sale-margins`, { token: buyer.token, body: { providerPercent: 20 } });
  s.check("margen general de la tienda 20 %", prov.status === 200 && prov.data?.providerPercent === 20, prov);
  const used = await api("PUT", `/providers/${key}/sale-margins/conditions`, { token: buyer.token, body: { conditions: ["USED"], percent: 5 } });
  s.check("margen para Usado 5 %", used.status === 200 && used.data?.conditions?.find((c) => c.condition === "USED")?.percent === 5, used);

  const search = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("notebook")}`, { token: buyer.token });
  const byName = (re) => (search.data ?? []).find((p) => re.test(p.name));
  const nUsed = byName(/Usada/);
  const nNew = byName(/Nueva/);
  s.check("en la búsqueda, la usada lleva 5 % (121 → 127,05)", num(nUsed?.sale?.finalPrice) === 127.05 && nUsed?.sale?.source === "condition", nUsed?.sale);
  s.check("la nueva lleva el 20 % de la tienda (121 → 145,2)", num(nNew?.sale?.finalPrice) === 145.2 && nNew?.sale?.source === "provider", nNew?.sale);

  const asSeller = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("notebook usada")}`, { token: seller.token });
  const sp = (asSeller.data ?? [])[0];
  s.check("el vendedor ve 127,05 como precio y nada del costo", num(sp?.finalPrice) === 127.05 && !JSON.stringify(sp ?? {}).includes('"raw"') && sp?.sale?.marginPercent == null, sp);

  const bad = [
    [buyer.token, { conditions: ["NUEVO"], percent: 5 }, 400, "estado inventado → 400"],
    [buyer.token, { conditions: [], percent: 5 }, 400, "sin estados → 400"],
    [buyer.token, { conditions: ["USED"], percent: 5000 }, 400, "margen fuera de rango → 400"],
    [seller.token, { conditions: ["USED"], percent: 1 }, 403, "el vendedor no puede cambiarlo → 403"],
  ];
  for (const [token, body, status, name] of bad) {
    const r = await api("PUT", `/providers/${key}/sale-margins/conditions`, { token, body });
    s.check(name, r.status === status, r);
  }
  const elit = await api("PUT", "/providers/ELIT/sale-margins/conditions", { token: buyer.token, body: { conditions: ["USED"], percent: 5 } });
  s.check("a un distribuidor no se le pone margen por estado → 400", elit.status === 400, elit);
  const hist = await api("GET", `/my/sale-margins/history?provider=${key}`, { token: buyer.token });
  s.check("el historial lo registra como «Estado: Usado»", (hist.data ?? []).some((h) => h.label === "Estado: Usado" && h.after === 5), hist.data);

  const refreshed = await api("POST", `/my/quotes/${ctx.q.atCostQuote}/refresh-prices`, { token: buyer.token });
  s.check("al actualizar precios, el presupuesto deja de estar al costo", refreshed.data?.quote?.atCostLines === 0 && refreshed.data.quote.items[0].unitFinalPrice === 127.05, refreshed.data?.quote);
}

async function q3Quotes(ctx) {
  const s = scenario("Q3", "Presupuesto completo: margen propio, descuento, línea libre, estados");
  const { buyer, key, ids } = ctx.q;
  const create = await api("POST", "/my/quotes", { token: buyer.token, body: { clientName: "Juan Pérez", clientPhone: "1155550000", clientEmail: "juan@cliente.test" } });
  s.check("crear con mail del cliente → 201, borrador, con vencimiento", create.status === 201 && create.data?.status === "DRAFT" && create.data?.validUntil && create.data?.clientEmail === "juan@cliente.test", create.data);
  const id = create.data?.id;
  await api("POST", `/my/quotes/${id}/items`, { token: buyer.token, body: { provider: key, externalId: ids[0], qty: 2 } });
  const two = await api("POST", `/my/quotes/${id}/items`, { token: buyer.token, body: { provider: key, externalId: ids[2], qty: 1 } });
  s.check("dos productos con el margen de la tienda", two.data?.items?.length === 2 && two.data.items.every((i) => i.unitFinalPrice === 145.2), two.data?.items);

  const qm = await api("PATCH", `/my/quotes/${id}`, { token: buyer.token, body: { marginPercent: 10 } });
  s.check("margen del presupuesto 10 % → recalcula todo (133,1)", qm.status === 200 && qm.data?.items?.every((i) => i.unitFinalPrice === 133.1 && i.marginSource === "quote"), qm.data?.items);
  const line = await api("PATCH", `/my/quotes/${id}/items/1`, { token: buyer.token, body: { marginPercent: 50 } });
  s.check("margen propio de una línea 50 % (181,5) pisa al del presupuesto", line.data?.items?.[1]?.unitFinalPrice === 181.5 && line.data.items[1].marginSource === "line" && line.data.items[0].unitFinalPrice === 133.1, line.data?.items);

  const custom = await api("POST", `/my/quotes/${id}/items/custom`, { token: buyer.token, body: { name: "Armado y prueba", unitFinalPrice: 12100, currency: "ARS", ivaPercent: 21 } });
  const c = custom.data?.items?.[2];
  s.check("línea libre en pesos (neto 10.000)", custom.status === 201 && c?.kind === "custom" && c.unitFinalPrice === 12100 && c.unitPrice === 10000 && c.currency === "ARS", c);
  const badCustom = [
    { name: "", unitFinalPrice: 1, currency: "ARS" },
    { name: "x", unitFinalPrice: -1, currency: "ARS" },
    { name: "x", unitFinalPrice: 1, currency: "EUR" },
    { name: "x", unitFinalPrice: 1, currency: "ARS", ivaPercent: 15 },
  ];
  for (const body of badCustom) {
    const r = await api("POST", `/my/quotes/${id}/items/custom`, { token: buyer.token, body });
    s.check(`línea libre inválida ${JSON.stringify(body)} → 400`, r.status === 400, r);
  }
  const marginOnCustom = await api("PATCH", `/my/quotes/${id}/items/2`, { token: buyer.token, body: { marginPercent: 10 } });
  s.check("a una línea libre no se le pone margen → 400", marginOnCustom.status === 400, marginOnCustom);
  const priceOnProduct = await api("PATCH", `/my/quotes/${id}/items/0`, { token: buyer.token, body: { unitFinalPrice: 1 } });
  s.check("a un producto no se le pone precio a mano → 400", priceOnProduct.status === 400, priceOnProduct);

  const disc = await api("PATCH", `/my/quotes/${id}`, { token: buyer.token, body: { discountPercent: 10, currency: "ARS", terms: "Contado efectivo" } });
  const usd = round2(133.1 * 2 + 181.5);
  s.check(
    "descuento 10 %: subtotal, descuento y total por moneda",
    disc.data?.subtotals?.USD === usd && disc.data?.discounts?.USD === round2(usd * 0.1) && disc.data?.totals?.USD === round2(usd - round2(usd * 0.1)) && disc.data?.totals?.ARS === 10890,
    { subtotals: disc.data?.subtotals, discounts: disc.data?.discounts, totals: disc.data?.totals }
  );
  s.check("moneda y condiciones guardadas", disc.data?.currency === "ARS" && disc.data?.terms === "Contado efectivo", disc.data);
  const badPatch = [
    { discountPercent: 150 },
    { currency: "EUR" },
    { status: "EXPIRED" },
    { clientEmail: "no-es-mail" },
    { validUntil: "mañana" },
    { marginPercent: "diez" },
  ];
  for (const body of badPatch) {
    const r = await api("PATCH", `/my/quotes/${id}`, { token: buyer.token, body });
    s.check(`dato inválido ${JSON.stringify(body)} → 400`, r.status === 400, r);
  }

  const moved = await api("POST", `/my/quotes/${id}/items/2/move`, { token: buyer.token, body: { to: 0 } });
  s.check("mover la línea libre arriba", moved.data?.items?.[0]?.kind === "custom", moved.data?.items?.map((i) => i.name));
  const badMove = await api("POST", `/my/quotes/${id}/items/0/move`, { token: buyer.token, body: { to: 9 } });
  s.check("mover fuera de rango → 400", badMove.status === 400, badMove);

  const sent = await api("POST", `/my/quotes/${id}/sent`, { token: buyer.token });
  s.check("compartirlo lo marca enviado", sent.data?.status === "SENT" && sent.data?.sentAt, sent.data);
  const acc = await api("PATCH", `/my/quotes/${id}`, { token: buyer.token, body: { status: "ACCEPTED" } });
  s.check("el cliente lo aceptó", acc.data?.status === "ACCEPTED" && acc.data?.decidedAt, acc.data);
  const resent = await api("POST", `/my/quotes/${id}/sent`, { token: buyer.token });
  s.check("compartirlo otra vez no lo vuelve a «enviado»", resent.data?.status === "ACCEPTED", resent.data);

  const past = await api("PATCH", `/my/quotes/${ctx.q.atCostQuote}`, { token: buyer.token, body: { validUntil: new Date(Date.now() - 86_400_000).toISOString() } });
  s.check("con la fecha vencida queda «Vencido»", past.data?.status === "EXPIRED", past.data);
  const renew = await api("POST", `/my/quotes/${ctx.q.atCostQuote}/refresh-prices`, { token: buyer.token });
  s.check("actualizar precios lo renueva", renew.data?.quote?.status === "DRAFT" && new Date(renew.data.quote.validUntil) > new Date(), renew.data?.quote);

  const dup = await api("POST", `/my/quotes/${id}/duplicate`, { token: buyer.token });
  s.check(
    "duplicar: número nuevo, mismo cliente, líneas y margen, en borrador",
    dup.status === 201 && dup.data?.number > create.data?.number && dup.data?.clientName === "Juan Pérez" && dup.data?.items?.length === 3 && dup.data?.marginPercent === 10 && dup.data?.status === "DRAFT",
    dup.data
  );
  const filter = await api("GET", "/my/quotes?status=ACCEPTED", { token: buyer.token });
  s.check("filtrar por estado", (filter.data?.items ?? []).every((q) => q.status === "ACCEPTED") && (filter.data?.items ?? []).some((q) => q.id === id), filter.data?.items?.map((q) => q.status));
  const byMail = await api("GET", `/my/quotes?q=${encodeURIComponent("juan@cliente")}`, { token: buyer.token });
  s.check("buscar por mail del cliente", (byMail.data?.items ?? []).some((q) => q.id === id), byMail.data?.total);
  ctx.q.quoteId = id;
}

async function q4Seller(ctx) {
  const s = scenario("Q4", "El vendedor: sin costos ni márgenes, con tope de descuento");
  const { buyer, seller, key, ids, quoteId } = ctx.q;
  const tpl = await api("PUT", "/my/quote-settings", { token: buyer.token, body: { maxSellerDiscount: 5 } });
  s.check("el dueño pone tope de 5 % para vendedores", tpl.status === 200 && tpl.data?.maxSellerDiscount === 5, tpl);
  const mine = await api("POST", "/my/quotes", { token: seller.token, body: { clientName: "Cliente del vendedor" } });
  const add = await api("POST", `/my/quotes/${mine.data?.id}/items`, { token: seller.token, body: { provider: key, externalId: ids[1], qty: 1 } });
  const it = add.data?.items?.[0];
  s.check("el vendedor arma con precio de venta (127,05) sin ver margen", it?.unitFinalPrice === 127.05 && it.marginPercent === null && it.marginSource === null && add.data?.canEditMargins === false, add.data);
  const tryMargin = await api("PATCH", `/my/quotes/${mine.data?.id}`, { token: seller.token, body: { marginPercent: 1 } });
  s.check("no puede poner margen al presupuesto → 403", tryMargin.status === 403, tryMargin);
  const tryLine = await api("PATCH", `/my/quotes/${mine.data?.id}/items/0`, { token: seller.token, body: { marginPercent: 1 } });
  s.check("ni a una línea → 403", tryLine.status === 403, tryLine);
  const overDiscount = await api("PATCH", `/my/quotes/${mine.data?.id}`, { token: seller.token, body: { discountPercent: 6 } });
  s.check("descuento por encima del tope → 403", overDiscount.status === 403, overDiscount);
  const okDiscount = await api("PATCH", `/my/quotes/${mine.data?.id}`, { token: seller.token, body: { discountPercent: 5 } });
  s.check("descuento dentro del tope → 200", okDiscount.status === 200 && okDiscount.data?.discountPercent === 5, okDiscount);
  const other = await api("GET", `/my/quotes/${quoteId}`, { token: seller.token });
  s.check("no ve el presupuesto del dueño → 404", other.status === 404, other);
  const ownerSees = await api("GET", `/my/quotes/${mine.data?.id}`, { token: buyer.token });
  s.check("el dueño ve el del vendedor (con márgenes)", ownerSees.status === 200 && ownerSees.data?.canEditMargins === true && ownerSees.data.items[0].marginSource === "condition", ownerSees.data);
  const ownerMargin = await api("PATCH", `/my/quotes/${mine.data?.id}`, { token: buyer.token, body: { marginPercent: 30 } });
  const sellerView = await api("GET", `/my/quotes/${mine.data?.id}`, { token: seller.token });
  s.check(
    "si el dueño le pone margen, el vendedor ve el precio nuevo pero no el %",
    ownerMargin.status === 200 && sellerView.data?.items?.[0]?.unitFinalPrice === 157.3 && sellerView.data.marginPercent === null && !JSON.stringify(sellerView.data).includes('"marginPercent":30'),
    sellerView.data
  );
  s.check("en ningún momento viaja el costo (121) al vendedor", !JSON.stringify(sellerView.data).includes("121"), sellerView.data);
  const dupSeller = await api("POST", `/my/quotes/${mine.data?.id}/duplicate`, { token: seller.token });
  s.check("el vendedor duplica y no se lleva el margen que no ve", dupSeller.status === 201 && dupSeller.data?.items?.[0]?.unitFinalPrice === 127.05, dupSeller.data?.items);
}

async function q5Template(ctx) {
  const s = scenario("Q5", "Plantilla del PDF y logo");
  const { buyer, seller } = ctx.q;
  const get = await api("GET", "/my/quote-settings", { token: buyer.token });
  s.check("trae valores por defecto con el nombre del comercio", get.status === 200 && get.data?.businessName === buyer.name && get.data?.theme === "modern" && get.data?.validityDays === 7, get.data);
  const sellerGet = await api("GET", "/my/quote-settings", { token: seller.token });
  s.check("el vendedor la puede leer (arma el PDF)", sellerGet.status === 200, sellerGet);
  const sellerPut = await api("PUT", "/my/quote-settings", { token: seller.token, body: { theme: "bold" } });
  s.check("el vendedor no la cambia → 403", sellerPut.status === 403, sellerPut);
  const put = await api("PUT", "/my/quote-settings", {
    token: buyer.token,
    body: { theme: "classic", accentColor: "#0EA5E9", font: "serif", taxId: "30-12345678-9", terms: "Seña 30 %", validityDays: 10, numberPrefix: "TGS-", priceDisplay: "NET", showImages: false },
  });
  s.check(
    "guarda estilo, color, letra, datos y opciones",
    put.status === 200 && put.data?.theme === "classic" && put.data?.accentColor === "#0ea5e9" && put.data?.font === "serif" && put.data?.validityDays === 10 && put.data?.numberPrefix === "TGS-" && put.data?.priceDisplay === "NET" && put.data?.showImages === false,
    put.data
  );
  const fresh = await api("POST", "/my/quotes", { token: buyer.token, body: {} });
  const days = (new Date(fresh.data?.validUntil).getTime() - Date.now()) / 86_400_000;
  s.check("un presupuesto nuevo toma la validez de la plantilla (10 días)", days > 9.9 && days < 10.1, fresh.data?.validUntil);
  const bad = [
    { accentColor: "rojo" },
    { theme: "neon" },
    { font: "comic" },
    { validityDays: 0 },
    { validityDays: 400 },
    { priceDisplay: "OTRO" },
    { email: "no-mail" },
    { maxSellerDiscount: 150 },
    { showImages: "si" },
  ];
  for (const body of bad) {
    const r = await api("PUT", "/my/quote-settings", { token: buyer.token, body });
    s.check(`plantilla inválida ${JSON.stringify(body)} → 400`, r.status === 400, r);
  }
  const form = new FormData();
  form.append("file", new Blob([PNG_1PX], { type: "image/png" }), "logo.png");
  const logo = await api("POST", "/my/quote-settings/logo", { token: buyer.token, form });
  s.check("subir el logo (PNG) → /assets/<id>", logo.status === 201 && /^\/assets\/[0-9a-f-]+$/i.test(logo.data?.logoUrl ?? ""), logo);
  const asset = logo.data?.logoUrl ? await fetch(`${process.env.SIM_BASE_URL ?? "http://127.0.0.1:8091"}${logo.data.logoUrl}`) : null;
  s.check("el logo se sirve como imagen", asset?.status === 200 && /^image\/png/.test(asset.headers.get("content-type") ?? ""), { status: asset?.status, type: asset?.headers.get("content-type") });
  const fake = new FormData();
  fake.append("file", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "logo.png");
  const evil = await api("POST", "/my/quote-settings/logo", { token: buyer.token, form: fake });
  s.check("un archivo que dice ser PNG pero no lo es → 400", evil.status === 400, evil);
  const sellerLogo = new FormData();
  sellerLogo.append("file", new Blob([PNG_1PX], { type: "image/png" }), "logo.png");
  const sl = await api("POST", "/my/quote-settings/logo", { token: seller.token, form: sellerLogo });
  s.check("el vendedor no sube logo → 403", sl.status === 403, sl);
  const second = new FormData();
  second.append("file", new Blob([PNG_1PX], { type: "image/png" }), "logo2.png");
  const replaced = await api("POST", "/my/quote-settings/logo", { token: buyer.token, form: second });
  const oldGone = await fetch(`${process.env.SIM_BASE_URL ?? "http://127.0.0.1:8091"}${logo.data?.logoUrl}`);
  s.check("cambiar el logo borra el anterior", replaced.status === 201 && replaced.data?.logoUrl !== logo.data?.logoUrl && oldGone.status === 404, { status: oldGone.status });
  const del = await api("DELETE", "/my/quote-settings/logo", { token: buyer.token });
  s.check("quitar el logo", del.status === 200 && del.data?.logoUrl === null, del);
  const otherOrg = await api("GET", "/my/quote-settings", { token: ctx.q.store.token });
  s.check("otro comercio tiene su propia plantilla", otherOrg.data?.theme === "modern" && otherOrg.data?.businessName === ctx.q.store.name, otherOrg.data);
}

async function q6ImageSearch(ctx) {
  const s = scenario("Q6", "Búsqueda de fotos de las tiendas (Serper) con tope diario");
  const { store, buyer, storefrontId } = ctx.q;
  const short = await api("POST", "/my/storefront/images/search", { token: store.token, body: { query: "ab" } });
  s.check("texto muy corto → 400", short.status === 400, short);
  const noStore = await api("POST", "/my/storefront/images/search", { token: buyer.token, body: { query: "notebook lenovo" } });
  s.check("sin tienda propia → 404", noStore.status === 404, noStore);
  const hasKey = Boolean(await ctx.prisma.imageSyncSettings.findFirst({ where: { serperApiKeyEncrypted: { not: null } } }));
  const r = await api("POST", "/my/storefront/images/search", { token: store.token, body: { query: "notebook lenovo ideapad" } });
  if (hasKey) {
    s.check("con Serper configurado devuelve fotos", r.status === 201 && Array.isArray(r.data?.images), r);
  } else {
    s.check("sin Serper configurado: aviso claro (503), sin 500", r.status === 503, r);
    const row = await ctx.prisma.storefront.findUnique({ where: { id: storefrontId }, select: { imageSearchCount: true } });
    s.check("una búsqueda que falló no gasta cupo", row?.imageSearchCount === 0, row);
  }
  const day = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  await ctx.prisma.storefront.update({ where: { id: storefrontId }, data: { imageSearchDay: day, imageSearchCount: 25 } });
  const capped = await api("POST", "/my/storefront/images/search", { token: store.token, body: { query: "notebook lenovo ideapad" } });
  s.check("con el cupo del día lleno → 429 con mensaje", capped.status === 429 && /25 búsquedas/.test(capped.body?.message ?? ""), capped);
  await ctx.prisma.storefront.update({ where: { id: storefrontId }, data: { imageSearchDay: "2000-01-01", imageSearchCount: 25 } });
  const nextDay = await api("POST", "/my/storefront/images/search", { token: store.token, body: { query: "notebook lenovo ideapad" } });
  s.check("otro día el cupo se renueva (no 429)", nextDay.status !== 429, nextDay);

  // La foto automática (Primera foto) se puede conservar al editar.
  const ext = ctx.q.ids[0];
  const asset = await ctx.prisma.storedAsset.create({ data: { mimeType: "image/png", filename: "serper.png", byteSize: PNG_1PX.length, data: PNG_1PX }, select: { id: true } });
  await ctx.prisma.providerSyncCache.update({ where: { provider_externalId: { provider: ctx.q.key, externalId: ext } }, data: { imageUrl: `/assets/${asset.id}` } });
  const list = await api("GET", "/my/storefront/products", { token: store.token });
  const item = (list.data?.items ?? []).find((p) => p.externalId === ext);
  s.check("el producto muestra la foto automática marcada", item?.autoImage === true && item.images[0] === `/assets/${asset.id}`, item);
  const keep = await api("PUT", `/my/storefront/products/${ext}`, { token: store.token, body: { images: item?.images ?? [], stock: 2 } });
  s.check("guardar conservando la foto automática → 200 (antes: «no es de tu tienda»)", keep.status === 200, keep);
  const foreign = await ctx.prisma.storedAsset.create({ data: { mimeType: "image/png", filename: "otro.png", byteSize: PNG_1PX.length, data: PNG_1PX }, select: { id: true } });
  const steal = await api("PUT", `/my/storefront/products/${ext}`, { token: store.token, body: { images: [`/assets/${foreign.id}`] } });
  s.check("una foto ajena que no es la automática sigue rechazada → 400", steal.status === 400, steal);
}

async function q7Probes(ctx) {
  const s = scenario("Q7", "Entradas raras en presupuestos: ningún 5xx");
  const { buyer } = ctx.q;
  const probes = [
    ["GET", "/my/quotes/no-es-uuid"],
    ["PATCH", "/my/quotes/no-es-uuid", { clientName: "x" }],
    ["POST", "/my/quotes/no-es-uuid/duplicate"],
    ["POST", "/my/quotes/no-es-uuid/sent"],
    ["POST", "/my/quotes/no-es-uuid/items/custom", { name: "x", unitFinalPrice: 1, currency: "ARS" }],
    ["POST", `/my/quotes/${ctx.q.quoteId}/items/abc/move`, { to: 0 }],
    ["POST", `/my/quotes/${ctx.q.quoteId}/items/0/move`, { to: "x" }],
    ["PATCH", `/my/quotes/${ctx.q.quoteId}/items/999`, { qty: 1 }],
    ["PATCH", `/my/quotes/${ctx.q.quoteId}`, { status: null }],
    ["PATCH", `/my/quotes/${ctx.q.quoteId}`, { clientName: null, clientPhone: null, clientEmail: null, notes: null, terms: null, currency: null, validUntil: null, marginPercent: null, discountPercent: null }],
    ["PATCH", `/my/quotes/${ctx.q.quoteId}/items/0`, { qty: null, name: null, unitFinalPrice: null }],
    ["PATCH", `/my/quotes/${ctx.q.quoteId}/items/1`, { qty: null, marginPercent: null }],
    ["PUT", "/my/quote-settings", { theme: null, font: null, accentColor: null, validityDays: null, showImages: null, priceDisplay: null, numberPrefix: null, businessName: null }],
    ["POST", "/my/quotes", { clientName: { $ne: 1 } }],
    ["PATCH", `/my/quotes/${ctx.q.quoteId}`, { discountPercent: "1e400" }],
    ["PUT", "/my/quote-settings", { numberPrefix: "<script>" }],
    ["PUT", "/my/quote-settings", { businessName: "x".repeat(5000) }],
    ["POST", "/my/quote-settings/logo"],
    ["GET", "/my/quotes?status=<x>&q=%25%25"],
    ["PUT", "/providers/LIST_NO_EXISTE/sale-margins/conditions", { conditions: ["USED"], percent: 1 }],
  ];
  for (const [method, path, body] of probes) {
    const r = await api(method, path, { token: buyer.token, body });
    s.check(`${method} ${path.slice(0, 60)} → no 5xx`, r.status < 500, r);
  }
  const prefix = await api("GET", "/my/quote-settings", { token: buyer.token });
  s.check("el prefijo se limpia de caracteres raros", !/[<>]/.test(prefix.data?.numberPrefix ?? ""), prefix.data?.numberPrefix);
}

export const quoteScenarios = [q1Setup, q2Conditions, q3Quotes, q4Seller, q5Template, q6ImageSearch, q7Probes];
