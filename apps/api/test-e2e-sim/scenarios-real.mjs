// Escenarios R1–R6: casos como los de la vida real, de punta a punta, para
// Vender en NODO y Presupuestos. Un local de usados sube la planilla tal cual
// la exporta Excel en castellano, dos comercios le compran (y se pisan por la
// última unidad), uno de ellos cotiza una PC gamer a un cliente con su
// vendedor, y en el medio la tienda cambia precios, se queda sin stock y pausa.
// Contra el API local (SIM_ONLY=real).
import { api, scenario, sleep } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v == null ? null : Number(v));

async function retailer(ctx, suffix, name) {
  const u = await registerVerified(ctx, suffix);
  const boot = await api("POST", "/onboarding/bootstrap", { token: u.token, body: { name, trialPlan: "PRO" } });
  if (boot.status !== 201) throw new Error(`bootstrap ${name}: ${boot.status} ${JSON.stringify(boot.body)}`);
  return { ...u, token: boot.data.token, tenantId: boot.data.org.id, name };
}

async function sellerOf(owner, ctx, suffix) {
  const created = await api("POST", "/my/team/invite-codes", { token: owner.token, body: { role: "SELLER", maxUses: 1 } });
  const u = await registerVerified(ctx, suffix);
  const join = await api("POST", "/onboarding/join-team", { token: u.token, body: { code: created.data?.code } });
  if (!join.data?.token) throw new Error(`no entra el vendedor: ${JSON.stringify(join.body)}`);
  return { ...u, token: join.data.token };
}

async function waitFor(fn, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(300);
  }
  return null;
}

async function uploadSheet(s, token, key, bytes, filename, type) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), filename);
  const up = await api("POST", `/providers/${key}/imports`, { token, form });
  s.check(`subir «${filename}» → 201`, up.status === 201 && up.data?.id, up);
  let rec = up;
  for (let i = 0; i < 80 && rec.data?.status === "PROCESSING"; i++) {
    await sleep(500);
    rec = await api("GET", `/providers/${key}/imports/${up.data?.id}`, { token });
  }
  if (rec.data?.status === "NEEDS_REVIEW") {
    s.note(`«${filename}» quedó para revisar: ${JSON.stringify(rec.data?.reviewReasons ?? []).slice(0, 300)}`);
    rec = await api("POST", `/providers/${key}/imports/${up.data?.id}/apply`, { token });
    for (let i = 0; i < 80 && rec.data?.status !== "APPLIED" && rec.data?.status !== "FAILED"; i++) {
      await sleep(500);
      rec = await api("GET", `/providers/${key}/imports/${up.data?.id}`, { token });
    }
  }
  s.check(`«${filename}» queda aplicada`, rec.data?.status === "APPLIED", { status: rec.data?.status, error: rec.data?.error, stats: rec.data?.stats });
  return rec.data;
}

/**
 * La planilla de un local real: Excel en castellano la guarda con «;», con BOM,
 * coma decimal, punto de miles, «U$S» y «$», IVA 10,5, nombres con comillas,
 * acentos y «;» adentro, una fila sin stock y una línea vacía al final.
 */
function excelCsv(tag) {
  const rows = [
    ["Código", "Descripción", "Marca", "Categoría", "Precio", "IVA", "Stock", "Moneda"],
    ["U-3060", `Placa de video RTX 3060 12GB usada ${tag}`, "ASUS", "Placas de video", "185,00", "21", "1", "U$S"],
    ["U-5600", `Procesador Ryzen 5 5600 usado ${tag}`, "AMD", "Procesadores", "75,50", "21", "2", "U$S"],
    ["N-B550", `Mother B550M Aorus Elite nuevo ${tag}`, "Gigabyte", "Motherboards", "1.150,00", "10,5", "4", "U$S"],
    ["N-RAM16", `Memoria DDR4 16GB (2x8) 3200 ${tag}`, "Kingston", "Memorias", "38,90", "21", "10", "U$S"],
    ["N-SSD1T", `"SSD NVMe 1TB; caja abierta ${tag}"`, "WD", "Almacenamiento", "52", "21", "3", "USD"],
    ["P-GAB", `Gabinete Sentey "Vidrio" ARGB ${tag}`, "Sentey", "Gabinetes", "$ 85.000,00", "21", "5", "$"],
    ["P-FTE", `Fuente 650W 80+ Bronze ñandú ${tag}`, "Thermaltake", "Fuentes", "72.450", "21", "", "ARS"],
    ["P-MOU", `Mouse Logitech G203 ${tag}`, "Logitech", "Periféricos", "28.999,99", "21", "12", "Pesos"],
    [],
  ];
  return "﻿" + rows.map((r) => r.join(";")).join("\r\n");
}

async function r1Sheet(ctx) {
  const s = scenario("R1", "Local de usados: planilla de Excel en castellano, fichas y condiciones");
  const store = await retailer(ctx, "rst", `Usados Palermo ${ctx.stamp}`);
  const gamer = await retailer(ctx, "rga", `Gamer Shop ${ctx.stamp}`);
  const office = await retailer(ctx, "rof", `Compu Oficina ${ctx.stamp}`);
  ctx.r = { store, gamer, office, tag: ctx.prefix };

  const open = await api("POST", "/my/storefront", { token: store.token, body: { contactPhone: "011 15-4444-1234", contactNote: "Retiro por Palermo, lunes a sábado" } });
  s.check("abre la tienda", open.status === 201, open);
  const key = open.data?.provider;
  ctx.r.key = key;
  ctx.r.storefrontId = open.data?.id;

  await uploadSheet(s, store.token, key, Buffer.from(excelCsv(ctx.prefix), "utf8"), "stock octubre.csv", "text/csv");
  const list = await api("GET", "/my/storefront/products", { token: store.token });
  const items = list.data?.items ?? [];
  const by = (id) => items.find((p) => p.externalId === id);
  ctx.r.items = items;
  s.check("entran los 8 productos (la línea vacía no)", items.length === 8, items.map((p) => p.externalId));
  const expect = [
    ["U-3060", 185, "USD", 1],
    ["U-5600", 75.5, "USD", 2],
    ["N-B550", 1150, "USD", 4],
    ["N-RAM16", 38.9, "USD", 10],
    ["N-SSD1T", 52, "USD", 3],
    ["P-GAB", 85000, "ARS", 5],
    ["P-MOU", 28999.99, "ARS", 12],
  ];
  for (const [id, price, currency, stock] of expect) {
    const p = by(id);
    s.check(`${id}: precio ${price} ${currency}, stock ${stock}`, p && num(p.price) === price && p.currency === currency && p.stock === stock, p && { price: p.price, currency: p.currency, stock: p.stock, iva: p.ivaPercent });
  }
  const fte = by("P-FTE");
  s.check("la fuente en pesos con «72.450» (punto de miles) vale 72.450", fte && num(fte.price) === 72450 && fte.currency === "ARS", fte && { price: fte.price, currency: fte.currency, stock: fte.stock });
  s.note(`la fila sin stock quedó con stock ${JSON.stringify(fte?.stock)}`);
  s.check("el IVA 10,5 se lee como 10,5", num(by("N-B550")?.ivaPercent) === 10.5, by("N-B550"));
  s.check("acentos, ñ, comillas y «;» dentro del nombre", /ñandú/.test(fte?.name ?? "") && /SSD NVMe 1TB; caja abierta/.test(by("N-SSD1T")?.name ?? "") && /"Vidrio"/.test(by("P-GAB")?.name ?? ""), items.map((p) => p.name));

  // Estado y garantía como los carga un local de usados.
  const fichas = [
    ["U-3060", { condition: "USED", warranty: "30 días en el local", description: "Usada 1 año, sin minería. Con caja." }],
    ["U-5600", { condition: "USED", warranty: "30 días en el local" }],
    ["N-SSD1T", { condition: "OPEN_BOX", warranty: "6 meses en el local" }],
    ["N-B550", { condition: "NEW", warranty: "12 meses oficial" }],
  ];
  for (const [id, body] of fichas) {
    const r = await api("PUT", `/my/storefront/products/${id}`, { token: store.token, body });
    s.check(`ficha de ${id}: ${body.condition} · ${body.warranty}`, r.status === 200, r);
  }
  const conds = await api("PUT", "/my/storefront", {
    token: store.token,
    body: {
      defaultWarranty: "3 meses en el local",
      paymentMethods: ["CASH", "TRANSFER"],
      deliveryOptions: ["PICKUP"],
      salesTerms: "Precios en dólares al blue del día. Reservas con seña.",
      about: "Compra y venta de hardware usado probado.",
    },
  });
  s.check("condiciones de venta y garantía general", conds.status === 200 && conds.data?.defaultWarranty === "3 meses en el local", conds.data);
  const after = await api("GET", "/my/storefront/products", { token: store.token });
  const used = (after.data?.items ?? []).map((p) => p.warranty).filter(Boolean);
  s.check("las garantías cargadas quedan guardadas (el desplegable las ofrece)", used.filter((w) => w === "30 días en el local").length === 2 && used.includes("12 meses oficial"), used);

  // Los dos comercios la aceptan.
  for (const buyer of [gamer, office]) {
    const offer = await waitFor(async () => {
      const r = await api("GET", "/my/storefront-offers", { token: buyer.token });
      return (r.data ?? []).find((o) => o.provider === key);
    });
    s.check(`a «${buyer.name.split(" ").slice(0, 2).join(" ")}» se le ofrece la tienda`, offer?.audienceStatus === "PENDING", offer);
    const acc = await api("POST", `/my/storefront-offers/${ctx.r.storefrontId}`, { token: buyer.token, body: { decision: "ACCEPT" } });
    s.check("la acepta", acc.status === 201, acc);
  }

  // Lo que ve el comprador.
  const search = await api("GET", `/search/provider/${key}?name=${encodeURIComponent("ryzen")}`, { token: gamer.token });
  const ryzen = (search.data ?? [])[0];
  s.check("el comprador encuentra el Ryzen: neto 75,50, final 91,36 (IVA 21)", ryzen && num(ryzen.price) === 75.5 && num(ryzen.finalPrice) === 91.36, ryzen && { price: ryzen.price, finalPrice: ryzen.finalPrice });
  const mother = (await api("GET", `/search/provider/${key}?name=${encodeURIComponent("b550")}`, { token: gamer.token })).data?.[0];
  s.check("la mother con IVA 10,5: 1150 → 1270,75", mother && num(mother.finalPrice) === 1270.75, mother && { price: mother.price, finalPrice: mother.finalPrice });
  const gab = (await api("GET", `/search/provider/${key}?name=${encodeURIComponent("gabinete sentey")}`, { token: gamer.token })).data?.[0];
  s.check("el gabinete en pesos sale en pesos (85.000 → 102.850)", gab && gab.currency === "ARS" && num(gab.finalPrice) === 102850, gab && { price: gab.price, finalPrice: gab.finalPrice, currency: gab.currency });
  const info = await api("GET", `/my/storefront-item?provider=${key}&externalId=U-5600`, { token: gamer.token });
  s.check("la ficha del Ryzen trae Usado y su garantía", info.data?.item?.condition === "USED" && info.data.item.warranty === "30 días en el local", info.data?.item);
  const infoNoW = await api("GET", `/my/storefront-item?provider=${key}&externalId=P-MOU`, { token: gamer.token });
  s.check(
    "un producto sin garantía propia muestra la general de la tienda (o la deja a la vista)",
    infoNoW.status === 200 && (infoNoW.data?.item?.warranty === "3 meses en el local" || infoNoW.data?.store?.defaultWarranty === "3 meses en el local"),
    infoNoW.data
  );
}

async function r2Orders(ctx) {
  const s = scenario("R2", "Dos comercios piden la última placa; pedido de varios productos y en pesos");
  const { store, gamer, office, key } = ctx.r;
  const find = async (token, q) => (await api("GET", `/search/provider/${key}?name=${encodeURIComponent(q)}`, { token })).data?.[0];
  const gpu = await find(gamer.token, "rtx 3060");
  const ram = await find(gamer.token, "ddr4 16gb");
  const mouse = await find(gamer.token, "g203");
  const line = (p, qty) => ({ externalId: p.externalId, name: p.name, qty, unitPrice: Number(p.price), ivaPercent: 21, pricingMode: "list" });

  const big = await api("POST", "/orders/offline", {
    token: gamer.token,
    body: { orders: [{ provider: key, notes: "Paso el jueves a la tarde", items: [line(gpu, 1), line(ram, 2), line(mouse, 3)] }] },
  });
  const bigRow = big.data?.[0];
  s.check("Gamer Shop pide placa + 2 memorias + 3 mouses en un solo pedido", big.status === 201 && bigRow?.storefrontStatus === "PENDING", big);
  const otherGpu = await find(office.token, "rtx 3060");
  const small = await api("POST", "/orders/offline", { token: office.token, body: { orders: [{ provider: key, items: [line(otherGpu, 1)] }] } });
  const smallRow = small.data?.[0];
  s.check("Compu Oficina pide la misma placa (había 1)", small.status === 201, small);
  const both = await api("POST", "/orders/offline", { token: office.token, body: { orders: [{ provider: key, items: [line(otherGpu, 2)] }] } });
  s.check("pedir 2 de una placa que tiene 1 → 400", both.status === 400, both);

  const pend = await api("GET", "/my/storefront/orders?status=PENDING", { token: store.token });
  const rows = pend.data ?? [];
  const a = rows.find((o) => o.id === bigRow?.id);
  const b = rows.find((o) => o.id === smallRow?.id);
  s.check("la tienda ve los dos pedidos pendientes", Boolean(a && b), rows.map((o) => o.id));
  const mouseLine = a?.items?.find((i) => i.externalId === "P-MOU");
  s.check("el mouse en pesos llega con su precio en pesos", mouseLine && num(mouseLine.unitPrice) === 28999.99 && (mouseLine.currency ?? "ARS") === "ARS", mouseLine);
  if (mouseLine && !mouseLine.currency) s.note(`la línea del pedido no trae moneda: ${JSON.stringify(mouseLine)}`);
  s.note(`total del pedido que ve la tienda: ${JSON.stringify({ total: a?.total, totalFinal: a?.totalFinal, currency: a?.currency, quoteRate: a?.quoteRate })}`);

  const ok = await api("POST", `/my/storefront/orders/${bigRow?.id}/respond`, { token: store.token, body: { action: "CONFIRM", note: "Te lo separo. Jueves 17 h." } });
  s.check("la tienda confirma el de Gamer Shop", ok.status === 201 && ok.data?.status === "CONFIRMED", ok);
  const stocks = Object.fromEntries((await api("GET", "/my/storefront/products", { token: store.token })).data?.items?.map((p) => [p.externalId, p.stock]) ?? []);
  s.check("descuenta cada producto: placa 1→0, memorias 10→8, mouses 12→9", stocks["U-3060"] === 0 && stocks["N-RAM16"] === 8 && stocks["P-MOU"] === 9, stocks);
  const pend2 = await api("GET", "/my/storefront/orders?status=PENDING", { token: store.token });
  const b2 = (pend2.data ?? []).find((o) => o.id === smallRow?.id);
  s.check("el pedido de Compu Oficina ahora muestra stock 0 (la pantalla lo marca en amarillo)", b2?.items?.[0]?.stockNow === 0, b2?.items);
  const rej = await api("POST", `/my/storefront/orders/${smallRow?.id}/respond`, { token: store.token, body: { action: "REJECT", note: "Se vendió recién, perdón" } });
  s.check("y la tienda lo rechaza con motivo", rej.status === 201 && rej.data?.status === "REJECTED", rej);
  const gone = await find(office.token, "rtx 3060");
  s.check("la placa ya no aparece en la búsqueda (stock 0)", !gone, gone);
  const officeOrders = await api("GET", "/orders", { token: office.token });
  const mine = (officeOrders.data ?? []).find((o) => o.id === smallRow?.id);
  s.check("Compu Oficina ve el rechazo con el motivo", mine?.storefrontStatus === "REJECTED" && mine.storefrontNote === "Se vendió recién, perdón", mine && { st: mine.storefrontStatus, note: mine.storefrontNote });
}

async function r3GamerQuote(ctx) {
  const s = scenario("R3", "Presupuesto de una PC gamer para un cliente (márgenes, pesos y dólares, descuento)");
  const { gamer, key } = ctx.r;
  const m1 = await api("PUT", `/providers/${key}/sale-margins`, { token: gamer.token, body: { providerPercent: 25 } });
  const m2 = await api("PUT", `/providers/${key}/sale-margins/conditions`, { token: gamer.token, body: { conditions: ["USED"], percent: 12 } });
  s.check("margen de la tienda 25 % y 12 % para usados", m1.status === 200 && m2.status === 200, { m1: m1.status, m2: m2.status });

  const q = await api("POST", "/my/quotes", { token: gamer.token, body: { clientName: "Martín Gómez", clientPhone: "011 15-6789-1234", clientEmail: "martin.gomez@cliente.test" } });
  s.check("presupuesto nuevo para Martín", q.status === 201 && q.data?.initials === "MG", q.data);
  const id = q.data?.id;
  ctx.r.quoteId = id;
  const add = (externalId, qty = 1) => api("POST", `/my/quotes/${id}/items`, { token: gamer.token, body: { provider: key, externalId, qty } });
  // La placa se vendió: la búsqueda ya no la muestra (R2). Si igual se suma (desde una pestaña vieja), queda con stock 0.
  const sold = await add("U-3060");
  s.note(`sumar la placa vendida desde una pestaña vieja: ${sold.status}`);
  if (sold.status === 201) await api("DELETE", `/my/quotes/${id}/items/0`, { token: gamer.token });
  await add("U-5600");
  await add("N-B550");
  await add("N-RAM16", 2);
  await add("N-SSD1T");
  const last = await add("P-GAB");
  const items = last.data?.items ?? [];
  const it = (id_) => items.find((i) => i.externalId === id_);
  const expected = {
    "U-5600": round2(75.5 * 1.21 * 1.12),
    "N-B550": round2(1150 * 1.105 * 1.25),
    "N-RAM16": round2(38.9 * 1.21 * 1.25),
    "N-SSD1T": round2(52 * 1.21 * 1.25),
    "P-GAB": round2(85000 * 1.21 * 1.25),
  };
  for (const [ext, price] of Object.entries(expected)) {
    const line = it(ext);
    s.check(`${ext}: ${price} ${line?.currency ?? ""} (${line?.marginSource})`, line && Math.abs(line.unitFinalPrice - price) <= 0.01, line && { unitFinalPrice: line.unitFinalPrice, source: line.marginSource });
  }
  s.check("el Ryzen usado toma el 12 % de usados, el resto el 25 % de la tienda", it("U-5600")?.marginSource === "condition" && it("N-B550")?.marginSource === "provider", items.map((i) => [i.externalId, i.marginSource]));
  s.check("nada va al costo", last.data?.atCostLines === 0, last.data?.atCostLines);
  // El mismo producto otra vez suma cantidad, no línea.
  const again = await add("N-RAM16", 2);
  s.check("agregar otra vez las memorias suma cantidad (2 → 4), sin línea nueva", again.data?.items?.length === 5 && again.data.items.find((i) => i.externalId === "N-RAM16")?.qty === 4, again.data?.items?.map((i) => [i.externalId, i.qty]));
  const back = await api("PATCH", `/my/quotes/${id}/items/${again.data.items.findIndex((i) => i.externalId === "N-RAM16")}`, { token: gamer.token, body: { qty: 2 } });
  s.check("vuelve a 2 memorias", back.data?.items?.find((i) => i.externalId === "N-RAM16")?.qty === 2, back.data?.items);

  // Armado y envío en pesos, línea con margen especial, moneda del cliente, descuento por efectivo.
  const arm = await api("POST", `/my/quotes/${id}/items/custom`, { token: gamer.token, body: { name: "Armado, cable management y Windows", unitFinalPrice: 45000, currency: "ARS", ivaPercent: 21 } });
  const env = await api("POST", `/my/quotes/${id}/items/custom`, { token: gamer.token, body: { name: "Envío CABA", unitFinalPrice: 8000, currency: "ARS", ivaPercent: 0 } });
  s.check("armado y envío (envío sin IVA)", arm.status === 201 && env.status === 201 && env.data?.items?.at(-1)?.unitPrice === 8000, env.data?.items?.at(-1));
  const motherIdx = env.data.items.findIndex((i) => i.externalId === "N-B550");
  const special = await api("PATCH", `/my/quotes/${id}/items/${motherIdx}`, { token: gamer.token, body: { marginPercent: 8 } });
  s.check("a la mother le baja el margen a 8 % para cerrar la venta", Math.abs((special.data?.items?.[motherIdx]?.unitFinalPrice ?? 0) - round2(1150 * 1.105 * 1.08)) <= 0.01 && special.data.items[motherIdx].marginSource === "line", special.data?.items?.[motherIdx]);
  const patch = await api("PATCH", `/my/quotes/${id}`, {
    token: gamer.token,
    body: { currency: "ARS", discountPercent: 5, terms: "5 % off pagando en efectivo o transferencia.\nSeña 30 %.", notes: "Armado incluido. Entrega en 48 h." },
  });
  const v = patch.data;
  const usd = round2(v.items.filter((i) => i.currency === "USD").reduce((t, i) => t + i.unitFinalPrice * i.qty, 0));
  const ars = round2(v.items.filter((i) => i.currency === "ARS").reduce((t, i) => t + i.unitFinalPrice * i.qty, 0));
  s.check(
    "subtotales por moneda, 5 % de descuento en cada una",
    v.subtotals.USD === usd && v.subtotals.ARS === ars && v.totals.USD === round2(usd - round2(usd * 0.05)) && v.totals.ARS === round2(ars - round2(ars * 0.05)),
    { subtotals: v.subtotals, discounts: v.discounts, totals: v.totals, usd, ars }
  );
  s.check("condiciones con salto de línea guardadas", v.terms?.includes("\n") && v.currency === "ARS", v.terms);
  ctx.r.quote = v;

  const sent = await api("POST", `/my/quotes/${id}/sent`, { token: gamer.token });
  s.check("se lo manda por WhatsApp → Enviado", sent.data?.status === "SENT", sent.data?.status);
  const byPhone = await api("GET", `/my/quotes?q=${encodeURIComponent("6789")}`, { token: gamer.token });
  s.check("después lo busca por el teléfono del cliente", (byPhone.data?.items ?? []).some((x) => x.id === id), byPhone.data?.total);
  const byName = await api("GET", `/my/quotes?q=${encodeURIComponent("gomez")}`, { token: gamer.token });
  s.check("o por el apellido sin acento", (byName.data?.items ?? []).some((x) => x.id === id), byName.data?.items?.map((x) => x.clientName));
}

async function r4StoreChanges(ctx) {
  const s = scenario("R4", "La tienda cambia precios, se queda sin stock y pausa: el presupuesto se entera");
  const { store, gamer, key, quoteId } = ctx.r;
  const before = ctx.r.quote;
  const up = await api("PUT", "/my/storefront/products/N-RAM16", { token: store.token, body: { price: 42.5 } });
  s.check("la tienda sube la memoria de 38,90 a 42,50", up.status === 200, up);
  const out = await api("PUT", "/my/storefront/products/N-SSD1T", { token: store.token, body: { stock: 0 } });
  s.check("y se queda sin SSD", out.status === 200, out);
  const ref = await api("POST", `/my/quotes/${quoteId}/refresh-prices`, { token: gamer.token });
  const changes = ref.data?.changes ?? [];
  const ramChange = changes.find((c) => c.externalId === "N-RAM16");
  s.check("actualizar precios avisa la suba de la memoria con el antes y el después", ramChange && Math.abs(ramChange.after - round2(42.5 * 1.21 * 1.25)) <= 0.01 && Math.abs(ramChange.before - round2(38.9 * 1.21 * 1.25)) <= 0.01, ramChange);
  const ssdChange = changes.find((c) => c.externalId === "N-SSD1T");
  s.note(`el SSD sin stock al actualizar: ${JSON.stringify(ssdChange ?? "sin cambio informado")}`);
  const ssd = ref.data?.quote?.items?.find((i) => i.externalId === "N-SSD1T");
  s.check("el SSD queda en el presupuesto (no desaparece solo)", Boolean(ssd), ref.data?.quote?.items?.map((i) => i.externalId));
  s.check("las líneas libres no cambian", ref.data?.quote?.items?.filter((i) => i.kind === "custom").every((i) => [45000, 8000].includes(i.unitFinalPrice)), ref.data?.quote?.items);
  s.check("la mother conserva su margen de 8 %", ref.data?.quote?.items?.find((i) => i.externalId === "N-B550")?.marginSource === "line", null);
  s.check("se mantiene el descuento y la moneda", ref.data?.quote?.discountPercent === 5 && ref.data.quote.currency === "ARS", ref.data?.quote);
  s.note(`el estado después de actualizar precios (estaba ${before.status ?? "SENT"}): ${ref.data?.quote?.status}`);

  const pause = await api("PUT", "/my/storefront", { token: store.token, body: { status: "PAUSED" } });
  s.check("la tienda pausa", pause.status === 200, pause.status);
  const ref2 = await api("POST", `/my/quotes/${quoteId}/refresh-prices`, { token: gamer.token });
  s.check("con la tienda pausada, actualizar precios no rompe (sin 5xx) y no borra líneas", ref2.status < 500 && ref2.data?.quote?.items?.length === before.items.length, { status: ref2.status, changes: ref2.data?.changes?.length });
  s.note(`con la tienda pausada: ${ref2.data?.changes?.filter((c) => c.after === null).length ?? "?"} líneas sin precio (quedan con el anterior)`);
  const addPaused = await api("POST", `/my/quotes/${quoteId}/items`, { token: gamer.token, body: { provider: key, externalId: "P-MOU" } });
  s.check("con la tienda pausada no se suman productos suyos (4xx)", addPaused.status >= 400 && addPaused.status < 500, addPaused);
  await api("PUT", "/my/storefront", { token: store.token, body: { status: "ACTIVE" } });
  const ref3 = await api("POST", `/my/quotes/${quoteId}/refresh-prices`, { token: gamer.token });
  const ram = ref3.data?.quote?.items?.find((i) => i.externalId === "N-RAM16");
  s.check("reactivada, los precios vuelven a salir de la tienda", ram && Math.abs(ram.unitFinalPrice - round2(42.5 * 1.21 * 1.25)) <= 0.01, ram);
  await api("PUT", "/my/storefront/products/N-SSD1T", { token: store.token, body: { stock: 3 } });
}

async function r5Seller(ctx) {
  const s = scenario("R5", "El vendedor del local arma su presupuesto; clics dobles y dos personas a la vez");
  const { gamer, key } = ctx.r;
  const seller = await sellerOf(gamer, ctx, "rsl");
  ctx.r.seller = seller;
  await api("PUT", "/my/quote-settings", { token: gamer.token, body: { maxSellerDiscount: 3, numberPrefix: "GS-", validityDays: 3 } });

  // Dueño y vendedor crean presupuestos a la vez: números sin repetir.
  const created = await Promise.all(
    Array.from({ length: 8 }, (_, i) => api("POST", "/my/quotes", { token: i % 2 ? seller.token : gamer.token, body: { clientName: `Cliente mostrador ${i + 1}` } }))
  );
  const numbers = created.map((r) => r.data?.number);
  s.check("8 presupuestos creados a la vez (dueño y vendedor): números todos distintos", created.every((r) => r.status === 201) && new Set(numbers).size === 8, numbers);

  const mine = created[1].data;
  const ids = ["U-5600", "N-B550", "N-RAM16", "N-SSD1T", "P-GAB", "P-MOU"];
  // El vendedor toca «Agregar» en seis productos casi a la vez (búsqueda con resultados, red lenta).
  const burst = await Promise.all(ids.map((externalId) => api("POST", `/my/quotes/${mine.id}/items`, { token: seller.token, body: { provider: key, externalId } })));
  s.check("seis «Agregar» a la vez → todos 201", burst.every((r) => r.status === 201), burst.map((r) => r.status));
  const after = await api("GET", `/my/quotes/${mine.id}`, { token: seller.token });
  s.check("y quedan los seis productos (no se pierde ninguno)", after.data?.items?.length === 6, after.data?.items?.map((i) => i.externalId));
  // Doble clic en el mismo producto.
  const dbl = await Promise.all([1, 2].map(() => api("POST", `/my/quotes/${mine.id}/items`, { token: seller.token, body: { provider: key, externalId: "P-MOU" } })));
  const afterDbl = await api("GET", `/my/quotes/${mine.id}`, { token: seller.token });
  const mouse = afterDbl.data?.items?.filter((i) => i.externalId === "P-MOU") ?? [];
  s.check("doble clic en el mouse: una sola línea con la cantidad sumada (1 + 2 = 3)", mouse.length === 1 && mouse[0].qty === 3, { status: dbl.map((r) => r.status), lines: mouse.map((m) => m.qty) });
  // Cambiar cantidades de dos líneas a la vez (dos campos editados rápido).
  const qtyBurst = await Promise.all([
    api("PATCH", `/my/quotes/${mine.id}/items/0`, { token: seller.token, body: { qty: 2 } }),
    api("PATCH", `/my/quotes/${mine.id}/items/1`, { token: seller.token, body: { qty: 3 } }),
  ]);
  const afterQty = await api("GET", `/my/quotes/${mine.id}`, { token: seller.token });
  s.check("dos cantidades cambiadas a la vez quedan las dos", afterQty.data?.items?.[0]?.qty === 2 && afterQty.data.items[1].qty === 3, { status: qtyBurst.map((r) => r.status), qty: afterQty.data?.items?.map((i) => i.qty) });

  const v = afterQty.data;
  s.check("el vendedor ve precios de venta sin margen ni costo", v.items.every((i) => i.marginPercent === null) && v.canEditMargins === false && !JSON.stringify(v).includes('"75.5"'), v.items.map((i) => [i.unitFinalPrice, i.marginSource]));
  const disc = await api("PATCH", `/my/quotes/${mine.id}`, { token: seller.token, body: { discountPercent: 4 } });
  s.check("4 % de descuento con tope 3 % → 403 con mensaje", disc.status === 403 && /3 %/.test(disc.body?.message ?? ""), disc);
  const disc3 = await api("PATCH", `/my/quotes/${mine.id}`, { token: seller.token, body: { discountPercent: 3 } });
  s.check("3 % → ok", disc3.status === 200, disc3.status);
  const days = (new Date(mine.validUntil).getTime() - Date.now()) / 86_400_000;
  s.check("vale 3 días (lo que puso el dueño en la plantilla)", days > 2.9 && days < 3.1, mine.validUntil);
  const list = await api("GET", "/my/quotes", { token: seller.token });
  s.check("el vendedor solo ve los suyos", (list.data?.items ?? []).every((x) => x.mine), (list.data?.items ?? []).map((x) => x.mine));
  const ownerList = await api("GET", "/my/quotes", { token: gamer.token });
  s.check("el dueño ve todos, con quién lo hizo", (ownerList.data?.items ?? []).some((x) => x.id === mine.id && x.createdByName === seller.username), null);
  // Borrar las líneas de a una muy rápido (índices que se corren).
  const before = afterQty.data.items.length;
  const rmA = await api("DELETE", `/my/quotes/${mine.id}/items/${before - 1}`, { token: seller.token });
  const rmB = await api("DELETE", `/my/quotes/${mine.id}/items/${before - 1}`, { token: seller.token });
  s.check("borrar la última línea dos veces seguidas: la segunda → 404 (no borra otra)", rmA.status === 200 && rmB.status === 404, { a: rmA.status, b: rmB.status });
}

async function r6Limits(ctx) {
  const s = scenario("R6", "Presupuesto grande, datos del cliente reales y vencido");
  const { gamer, key } = ctx.r;
  const q = await api("POST", "/my/quotes", {
    token: gamer.token,
    body: { clientName: "Estudio Contable Pérez & Asociados (sucursal Belgrano) 🎮", clientPhone: "+54 9 351 15-555-1234", notes: "Equipar 30 puestos.\nFacturar a nombre del estudio." },
  });
  s.check("cliente con &, paréntesis, emoji y teléfono de Córdoba (iniciales EA)", q.status === 201 && q.data?.initials === "EA", q.data && { initials: q.data.initials, name: q.data.clientName });
  const id = q.data?.id;
  let last;
  for (let i = 0; i < 40; i++) {
    last = await api("POST", `/my/quotes/${id}/items/custom`, { token: gamer.token, body: { name: `Puesto ${i + 1}: monitor + teclado + mouse`, unitFinalPrice: 350000 + i * 1.11, currency: "ARS", qty: 1 } });
  }
  s.check("40 líneas", last?.data?.items?.length === 40, last?.status);
  const sum = round2(Array.from({ length: 40 }, (_, i) => round2(350000 + i * 1.11)).reduce((a, b) => a + b, 0));
  s.check("el total suma exacto con centavos", last?.data?.totals?.ARS === sum, { api: last?.data?.totals, sum });
  await api("POST", `/my/quotes/${id}/items`, { token: gamer.token, body: { provider: key, externalId: "N-RAM16", qty: 30 } });
  const big = await api("PATCH", `/my/quotes/${id}/items/40`, { token: gamer.token, body: { qty: 9999 } });
  s.check("cantidad 9999 se acepta", big.data?.items?.[40]?.qty === 9999, big.status);
  const over = await api("PATCH", `/my/quotes/${id}/items/40`, { token: gamer.token, body: { qty: 10000 } });
  s.check("cantidad 10000 → 400", over.status === 400, over.status);
  const zero = await api("PATCH", `/my/quotes/${id}/items/40`, { token: gamer.token, body: { qty: 0 } });
  s.check("cantidad 0 → 400 (para eso está quitar)", zero.status === 400, zero.status);
  const dec = await api("PATCH", `/my/quotes/${id}/items/40`, { token: gamer.token, body: { qty: 1.5 } });
  s.check("cantidad 1,5 → 400", dec.status === 400, dec.status);

  const past = await api("PATCH", `/my/quotes/${id}`, { token: gamer.token, body: { validUntil: new Date(Date.now() - 2 * 86_400_000).toISOString() } });
  s.check("pasó la fecha → Vencido", past.data?.status === "EXPIRED", past.data?.status);
  const accept = await api("PATCH", `/my/quotes/${id}`, { token: gamer.token, body: { status: "ACCEPTED" } });
  s.check("el cliente llama igual y lo acepta → Aceptado", accept.data?.status === "ACCEPTED", accept.data?.status);
  const dup = await api("POST", `/my/quotes/${id}/duplicate`, { token: gamer.token });
  s.check("lo duplica para otra sucursal: 41 líneas, borrador y fecha nueva", dup.status === 201 && dup.data?.items?.length === 41 && dup.data.status === "DRAFT" && new Date(dup.data.validUntil) > new Date(), dup.data && { n: dup.data.items?.length, st: dup.data.status });
  const arch = await api("POST", `/my/quotes/${id}/archive`, { token: gamer.token });
  s.note(`archivar: ${arch.status}`);
}

export const realScenarios = [r1Sheet, r2Orders, r3GamerQuote, r4StoreChanges, r5Seller, r6Limits];
