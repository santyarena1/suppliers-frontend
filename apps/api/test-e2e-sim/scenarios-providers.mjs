// Escenarios P1–P6: un comercio nuevo arma solo sus proveedores (integración y por lista),
// qué ve en búsqueda y en /my/providers cuando un proveedor NO está bien configurado,
// y cómo se cruza todo con el tope de 5 proveedores del plan BASE.
//
// No sale a internet a propósito: con credenciales falsas NO se aprieta "Sincronizar"
// (POST /providers/:p/sync), que es lo único que llama al portal real. El API se
// levanta con CRON_DISABLED=true para que el cron de sync tampoco lo haga.
import { api, scenario, sleep } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";
import { bigList, brokenFiles, listVariants } from "./providers-fixtures.mjs";

const DAY = 86_400_000;

// ---------- helpers ----------

async function newRetailer(ctx, suffix, plan, { complete = true } = {}) {
  const r = await registerVerified(ctx, suffix);
  const boot = await api("POST", "/onboarding/bootstrap", { token: r.token, body: { name: `Comercio ${ctx.prefix} ${suffix}`, trialPlan: plan } });
  if (boot.status !== 201) throw new Error(`bootstrap ${suffix}: ${boot.status} ${JSON.stringify(boot.body)}`);
  r.token = boot.data.token;
  r.tenantId = boot.data.org.id;
  if (complete) await completeOnboarding(r);
  return r;
}

async function completeOnboarding(r) {
  const done = await api("POST", "/onboarding/complete", { token: r.token });
  if (done.status >= 300) throw new Error(`complete: ${done.status} ${JSON.stringify(done.body)}`);
  if (done.data?.token) r.token = done.data.token;
  return done;
}

async function uploadFile(token, provider, file) {
  const form = new FormData();
  form.append("file", new Blob([file.data]), file.filename);
  return api("POST", `/providers/${provider}/imports`, { token, form });
}

async function waitImport(token, provider, id, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  let rec = await api("GET", `/providers/${provider}/imports/${id}`, { token });
  while (rec.data?.status === "PROCESSING" && Date.now() < until) {
    await sleep(400);
    rec = await api("GET", `/providers/${provider}/imports/${id}`, { token });
  }
  return rec;
}

/** Sube, espera y aplica si queda en revisión. Devuelve { up, first, final, ms }. */
async function uploadAndApply(token, provider, file, { timeoutMs = 60_000, apply = true } = {}) {
  const t0 = Date.now();
  const up = await uploadFile(token, provider, file);
  if (!up.data?.id) return { up, first: up, final: up, ms: Date.now() - t0 };
  const first = await waitImport(token, provider, up.data.id, timeoutMs);
  let final = first;
  if (apply && first.data?.status === "NEEDS_REVIEW") {
    const ap = await api("POST", `/providers/${provider}/imports/${up.data.id}/apply`, { token });
    final = ap.status < 300 ? await waitImport(token, provider, up.data.id, timeoutMs) : ap;
  }
  return { up, first, final, ms: Date.now() - t0 };
}

const search = (token, provider, q) => api("GET", `/search/provider/${provider}?name=${encodeURIComponent(q)}`, { token });
const priceOf = (p) => (p ? Number(p.price ?? p.finalPrice) : null);

async function myProvider(token, key) {
  const r = await api("GET", "/my/providers", { token });
  return (r.data ?? []).find((p) => p.provider === key) ?? null;
}

async function createListProvider(token, name, extra = {}) {
  return api("POST", "/providers", { token, body: { name, type: "DISTRIBUTOR", ...extra } });
}

async function connectByListKey(token, key, label) {
  const dir = await api("GET", `/my/suppliers/search?q=${encodeURIComponent(label)}`, { token });
  const row = (dir.data ?? []).find((x) => x.providerKey === key);
  if (!row) return { dir, conn: null, row: null };
  const conn = await api("POST", `/my/suppliers/${row.id}/connect-by-list`, { token });
  return { dir, conn, row };
}

const compact = (p) => p && { provider: p.provider, linked: p.linked, selfConnected: p.selfConnected, inSearch: p.inSearch, includeInSearch: p.includeInSearch, priceChannel: p.purchase?.priceChannel };

// ---------- P1: demos del onboarding ----------

export async function p1OnboardingDemo(ctx) {
  const s = scenario("P1", "Distribuidores DEMO del onboarding antes y después de completarlo");
  const r = await newRetailer(ctx, "pdemo", "PRO", { complete: false });
  ctx.pDemo = r;
  const before = await api("GET", "/my/providers", { token: r.token });
  const demos = (before.data ?? []).filter((p) => p.provider.startsWith("LIST_DEMO_"));
  s.check("recién creado: /my/providers trae LIST_DEMO_NORTE y LIST_DEMO_SUR vinculados y en búsqueda", demos.length === 2 && demos.every((d) => d.linked && d.inSearch), { demos: demos.map(compact) });
  const offer = await ctx.prisma.tenantProductOffer.findFirst({ where: { tenantId: r.tenantId, provider: "LIST_DEMO_NORTE", active: true }, include: { product: true } });
  const q = offer?.product?.name?.split(" ").slice(0, 2).join(" ") ?? "mouse";
  const sr = await search(r.token, "LIST_DEMO_NORTE", q);
  s.check(`en el recorrido la búsqueda en DEMO_NORTE ("${q}") trae productos`, (sr.data?.length ?? 0) > 0, { status: sr.status, count: sr.data?.length });
  const sub = await api("GET", "/my/subscription", { token: r.token });
  s.note(`Durante el onboarding /my/subscription.usage cuenta los demos: ${JSON.stringify(sub.data?.usage)}`);

  await completeOnboarding(r);
  const after = await api("GET", "/my/providers", { token: r.token });
  const demosAfter = (after.data ?? []).filter((p) => p.provider.startsWith("LIST_DEMO_"));
  s.check("completado: los DEMO desaparecen de /my/providers", demosAfter.length === 0, { demosAfter: demosAfter.map(compact) });
  const sr2 = await search(r.token, "LIST_DEMO_NORTE", q);
  s.check("completado: búsqueda en DEMO_NORTE → vacía", sr2.status === 200 && (sr2.data?.length ?? 0) === 0, { status: sr2.status, count: sr2.data?.length });
  const sub2 = await api("GET", "/my/subscription", { token: r.token });
  s.check("completado: usage.connectedProviders = 0", sub2.data?.usage?.connectedProviders === 0, sub2.data?.usage);

  // Lo que queda de la demo en otras vistas.
  const feat = await api("GET", "/catalog/featured?take=50&mixed=1", { token: r.token });
  const featDemo = (feat.data ?? []).filter((p) => String(p.provider).startsWith("LIST_DEMO_"));
  s.check("completado: /catalog/featured no trae productos DEMO", featDemo.length === 0, { count: featDemo.length });
  const brands = await api("GET", "/catalog/brands", { token: r.token });
  s.check("completado: /catalog/brands vacío (sin proveedores configurados)", Array.isArray(brands.data) && brands.data.length === 0, { status: brands.status, sample: (brands.data ?? []).slice(0, 5) });
  const cats = await api("GET", "/catalog/categories", { token: r.token });
  s.check("completado: /catalog/categories vacío", Array.isArray(cats.data) && cats.data.length === 0, { status: cats.status, sample: (cats.data ?? []).slice(0, 5) });
  const orders = await api("GET", "/orders", { token: r.token });
  const rows = Array.isArray(orders.data) ? orders.data : orders.data?.orders ?? [];
  const demoOrders = rows.filter((o) => String(o.provider ?? "").startsWith("LIST_DEMO_") || /\[DEMO\]/.test(o.notes ?? ""));
  s.check("completado: /orders sin los pedidos [DEMO]", demoOrders.length === 0, { demoOrders: demoOrders.map((o) => ({ id: o.id, provider: o.provider, notes: o.notes, status: o.status })) }, {
    hint: "onboarding.service.ts seedDemoSandbox crea pedidos '[DEMO] …' (≈ línea 622-661) y complete() no los borra; /orders no filtra proveedores DEMO",
  });
  const cart = await api("GET", "/cart/org", { token: r.token });
  const demoCart = (cart.data?.items ?? []).filter((i) => String(i.provider).startsWith("LIST_DEMO_"));
  s.check("completado: carrito del local sin ítems DEMO", demoCart.length === 0, { demoCart });
  const pdetail = await api("GET", "/providers/LIST_DEMO_NORTE/catalog?q=", { token: r.token });
  s.check("completado: /providers/LIST_DEMO_NORTE/catalog → total 0", (pdetail.data?.total ?? 0) === 0, { status: pdetail.status, total: pdetail.data?.total });
  const st = await api("GET", "/providers/LIST_DEMO_NORTE/status", { token: r.token });
  s.check("completado: /providers/LIST_DEMO_NORTE/status → 404 (no existe para el comercio)", st.status === 404, st);
}

// ---------- P2: proveedores con integración, credenciales ----------

export async function p2Integrated(ctx) {
  const s = scenario("P2", "Proveedor con integración (ELIT/INVID) sin credenciales, con credenciales falsas y apagado");
  const r = await newRetailer(ctx, "pint", "PRO");
  ctx.pInt = r;

  const pre = await api("POST", "/credentials", { token: r.token, body: { providerName: "INVID", credentials: { username: "falso", password: "falso" } } });
  s.check("credenciales de un proveedor NO vinculado (INVID) → 404, no se guardan", pre.status === 404, pre);

  const dir = await api("GET", "/my/suppliers/search?q=Elit", { token: r.token });
  const elitRow = (dir.data ?? []).find((x) => x.providerKey === "ELIT");
  s.check("directorio /my/suppliers/search?q=Elit → ELIT con hasApi=true, sin vínculo", elitRow?.hasApi === true && elitRow.linkStatus === null, { status: dir.status, elitRow });
  const before = await myProvider(r.token, "ELIT");
  s.check("antes de conectar, ELIT no está en /my/providers", before === null, { before });

  const conn = await api("POST", `/my/suppliers/${elitRow?.id}/connect-by-list`, { token: r.token });
  s.check("conectarse a ELIT desde el directorio → 201 LIST_CONNECTED", conn.status === 201 && conn.data?.status === "LIST_CONNECTED", conn);
  const row = await myProvider(r.token, "ELIT");
  s.note(`ELIT recién conectado, sin credenciales ni lista: /my/providers → ${JSON.stringify(compact(row))}`);
  s.check("[dueño] ELIT sin credenciales NO debería estar en búsqueda (inSearch=false)", row && row.inSearch === false, { row: compact(row) }, {
    hint: "tenant-visibility.service.ts:295-305 selectSearchProviders recibe todo vinculado sin mirar credenciales ni ofertas; connectByList (tenants.service.ts:365-369) deja priceChannel LIST aunque el proveedor tenga API",
  });
  const status0 = await api("GET", "/providers/ELIT/status", { token: r.token });
  s.note(`/providers/ELIT/status sin credenciales: ${JSON.stringify(status0.data)}`);

  // Fichas globales de ELIT (de otros comercios / sync) que se cuelan en la búsqueda.
  const ficha = await ctx.prisma.providerSyncCache.findFirst({ where: { provider: "ELIT" }, select: { name: true, externalId: true } });
  if (ficha) {
    const q = ficha.name.split(/\s+/).slice(0, 2).join(" ");
    const sr = await search(r.token, "ELIT", q);
    const noPrice = (sr.data ?? []).filter((p) => p.price == null && p.finalPrice == null);
    s.check(`[dueño] búsqueda en ELIT sin credenciales ("${q}") no muestra nada`, sr.status === 200 && (sr.data?.length ?? 0) === 0, { status: sr.status, count: sr.data?.length, sinPrecio: noPrice.length, first: sr.data?.[0] && { name: sr.data[0].name, price: sr.data[0].price, stock: sr.data[0].stock } }, {
      hint: "providers.service.ts:965-1002 search: si el comercio no tiene precios propios (hideSheets=false) agrega fichas de providerSyncCache sin precio (toSheetView, catalog-view.ts:84-104)",
    });
    const byProv = await api("GET", "/catalog/by-provider?providers=ELIT&take=20", { token: r.token });
    s.check("[dueño] /catalog/by-provider?providers=ELIT sin credenciales → vacío", (byProv.data?.length ?? byProv.data?.items?.length ?? 0) === 0, { status: byProv.status, count: byProv.data?.length ?? byProv.data?.items?.length });
    const cat = await api("GET", "/providers/ELIT/catalog?q=", { token: r.token });
    s.check("[dueño] /providers/ELIT/catalog sin credenciales → total 0", (cat.data?.total ?? 0) === 0, { status: cat.status, total: cat.data?.total });
  } else {
    s.note("No hay fichas ELIT en providerSyncCache local: no se puede ver si se cuelan sin precio");
  }

  // Credenciales falsas.
  const t0 = Date.now();
  const save = await api("POST", "/credentials", { token: r.token, body: { providerName: "ELIT", credentials: { userId: "999999", token: "falso-sim" } } });
  const ms = Date.now() - t0;
  s.check(`guardar credenciales falsas de ELIT → 201 sin validarlas (${ms} ms)`, save.status === 201, save);
  s.note(`El API NO valida credenciales al guardar: responde en ${ms} ms sin llamar al portal (credentials.service.ts:45-61). La respuesta devuelve credentialsJson en claro.`);
  const empty = await api("POST", "/credentials", { token: r.token, body: { providerName: "ELIT", credentials: {} } });
  s.check("credenciales vacías {} → 400", empty.status === 400, empty, { hint: "SaveCredentialDto solo @IsObject (dto/save-credential.dto.ts:7-8): acepta {} y valores no-string" });
  const weird = await api("POST", "/credentials", { token: r.token, body: { providerName: "ELIT", credentials: { userId: 123, token: { nested: true } } } });
  s.check("credenciales con valores no-string → 400", weird.status === 400, weird);
  await api("POST", "/credentials", { token: r.token, body: { providerName: "ELIT", credentials: { userId: "999999", token: "falso-sim" } } });
  const row2 = await myProvider(r.token, "ELIT");
  s.note(`ELIT con credenciales inválidas (nunca sincronizó): /my/providers → ${JSON.stringify(compact(row2))} — no hay campo que diga 'credencial inválida'`);
  const status1 = await api("GET", "/providers/ELIT/status", { token: r.token });
  s.check("/providers/ELIT/status → hasCredentials=true, total 0, sin corrida", status1.data?.hasCredentials === true && status1.data?.total === 0, status1);

  // Apagado.
  const off = await api("PUT", "/my/providers/ELIT/search", { token: r.token, body: { enabled: false } });
  s.check("apagar ELIT en búsqueda → 200 inSearch=false", off.status === 200 && off.data?.inSearch === false, off);
  const row3 = await myProvider(r.token, "ELIT");
  s.note(`ELIT apagado: sigue en /my/providers → ${JSON.stringify(compact(row3))}`);
  if (ficha) {
    const sr3 = await search(r.token, "ELIT", ficha.name.split(/\s+/).slice(0, 2).join(" "));
    s.check("ELIT apagado → búsqueda vacía", sr3.status === 200 && (sr3.data?.length ?? 0) === 0, { status: sr3.status, count: sr3.data?.length });
  }
  const del = await api("DELETE", "/credentials/ELIT", { token: r.token });
  s.check("borrar credenciales de ELIT → 200", del.status === 200, del);
  const row4 = await myProvider(r.token, "ELIT");
  s.note(`ELIT sin credenciales después de borrarlas: sigue vinculado en /my/providers → ${JSON.stringify(compact(row4))}; no hay forma de desconectarse (no existe DELETE de vínculo para el comercio)`);
  const sync = await api("POST", "/providers/INVID/sync", { token: r.token });
  s.check("sync de un proveedor no vinculado → 4xx", sync.status >= 400 && sync.status < 500, sync);
}

// ---------- P3: proveedores por lista, variantes de planilla ----------

export async function p3ListVariants(ctx) {
  const s = scenario("P3", "Proveedor por lista creado por el comercio: variantes de Excel/CSV");
  const r = ctx.pInt;
  const tag = `pv${ctx.stamp.slice(-7)}`;
  ctx.pTag = tag;
  for (const v of listVariants(tag)) {
    const c = await createListProvider(r.token, `Lista ${v.key} ${ctx.prefix}`);
    if (!s.check(`${v.key}: crear proveedor por lista → 201`, c.status === 201 && c.data?.providerKey, c)) continue;
    const key = c.data.providerKey;
    const res = await uploadAndApply(r.token, key, v);
    const reasons = res.first.data?.reviewReasons ?? [];
    s.note(`${v.key} (${v.desc}): 1.ª carga → ${res.first.data?.status} [${reasons.join(" | ").slice(0, 200)}] · filas=${res.first.data?.rowsData} · issues=${res.first.data?.summary?.issues}`);
    const prof = await api("GET", `/providers/${key}/import-profile`, { token: r.token });
    const p = prof.data?.active ?? prof.data?.proposed;
    s.note(`${v.key}: perfil → hoja ${p?.sheetIndex} fila encabezado ${p?.headerRow} formato ${p?.numberFormat} moneda ${p?.currency} columnas ${JSON.stringify(p?.columnMap)}`);
    s.check(`${v.key}: queda APPLIED`, res.final.data?.status === "APPLIED", { status: res.final.data?.status, error: res.final.data?.error, http: res.final.status, body: res.final.status >= 300 ? res.final.body : undefined });
    for (const [token, expected] of Object.entries(v.expect)) {
      const sr = await search(r.token, key, token);
      const hit = (sr.data ?? [])[0];
      s.check(`${v.key}: "${token}" aparece en búsqueda con precio ${expected}`, hit && Math.abs(priceOf(hit) - expected) < 0.01, { status: sr.status, count: sr.data?.length, price: hit?.price, finalPrice: hit?.finalPrice, currency: hit?.currency });
    }
    if (v.key === "V1") ctx.pV1 = { key, file: v };
    if (v.key === "V3") {
      const sr = await search(r.token, key, `${tag}c4`);
      s.note(`V3: fila con precio 'consultar' → ${sr.data?.length ? `aparece con price=${sr.data[0].price}` : "no aparece"}`);
    }
  }

  // Archivos rotos.
  const broken = await createListProvider(r.token, `Lista Rota ${ctx.prefix}`);
  const bkey = broken.data?.providerKey;
  for (const f of brokenFiles()) {
    const up = await uploadFile(r.token, bkey, f);
    let final = up;
    if (up.data?.id) final = await waitImport(r.token, bkey, up.data.id);
    const ok = up.status === 400 || final.data?.status === "FAILED" || final.data?.status === "NEEDS_REVIEW";
    s.check(`${f.key} ${f.desc} → 400 o FAILED (sin 5xx)`, ok && up.status < 500, { http: up.status, message: up.body?.message, status: final.data?.status, error: final.data?.error, reasons: final.data?.reviewReasons });
    if (final.data?.status === "NEEDS_REVIEW") {
      const ap = await api("POST", `/providers/${bkey}/imports/${up.data.id}/apply`, { token: r.token });
      s.check(`${f.key}: aplicar una carga sin filas → 4xx`, ap.status >= 400 && ap.status < 500, ap);
    }
  }
  const rowB = await myProvider(r.token, bkey);
  s.note(`Proveedor con solo cargas fallidas (lista nunca aplicada): /my/providers → ${JSON.stringify(compact(rowB))}`);
  s.check("[dueño] proveedor por lista sin ninguna carga aplicada NO debería estar en búsqueda", rowB && rowB.inSearch === false, { row: compact(rowB) }, {
    hint: "tenant-visibility.service.ts:295-305: inSearch no mira si hay ofertas/carga aplicada",
  });
  const sub = await api("GET", "/my/subscription", { token: r.token });
  s.note(`usage del comercio PRO con proveedores rotos/sin lista: ${JSON.stringify(sub.data?.usage)}`);
}

// ---------- P4: re-subida, revertir, vigencia y lista grande ----------

export async function p4ReuploadFreshness(ctx) {
  const s = scenario("P4", "Re-subida, revertir, vencimiento de la lista y lista de 20k filas");
  const r = ctx.pInt;
  const tag = ctx.pTag;
  if (!ctx.pV1) return s.check("hay proveedor V1 de P3", false, null);
  const { key } = ctx.pV1;
  const { xlsxBuffer } = await import("./providers-fixtures.mjs");
  // Misma estructura, A1 cambia precio, A4 desaparece, A5 nueva.
  const second = {
    filename: "lista-estandar-v2.xlsx",
    data: xlsxBuffer([
      {
        name: "Lista",
        rows: [
          ["SKU", "Descripción", "Precio", "Stock", "IVA", "Moneda"],
          [`${tag}-A1`, `Producto ${tag}a1 Mouse`, 14, 40, 21, "USD"],
          [`${tag}-A2`, `Producto ${tag}a2 Teclado`, 35.9, 15, 21, "USD"],
          [`${tag}-A3`, `Producto ${tag}a3 Monitor`, 149, 8, 10.5, "USD"],
          [`${tag}-A5`, `Producto ${tag}a5 Pad`, 6, 20, 21, "USD"],
        ],
      },
    ]),
  };
  const res = await uploadAndApply(r.token, key, second);
  s.note(`re-subida con mismo formato: 1.ª evaluación ${res.first.data?.status} [${(res.first.data?.reviewReasons ?? []).join(" | ")}] diff=${JSON.stringify(res.first.data?.summary ?? {}).slice(0, 200)}`);
  s.check("re-subida → APPLIED", res.final.data?.status === "APPLIED", { status: res.final.data?.status, error: res.final.data?.error });
  const a1 = (await search(r.token, key, `${tag}a1`)).data?.[0];
  s.check("re-subida: a1 actualiza el precio a 14", priceOf(a1) === 14, { price: a1?.price, finalPrice: a1?.finalPrice });
  const a4 = await search(r.token, key, `${tag}a4`);
  s.check("re-subida: a4 (ya no está en la lista) deja de aparecer en búsqueda", (a4.data?.length ?? 0) === 0, { count: a4.data?.length, first: a4.data?.[0] && { price: a4.data[0].price, active: a4.data[0].active } });
  const a4db = await ctx.prisma.tenantProductOffer.findFirst({ where: { tenantId: r.tenantId, provider: key, externalId: { contains: "A4" } }, select: { active: true, price: true } });
  s.note(`a4 en la base después de la re-subida: ${JSON.stringify(a4db)}`);
  const a5 = (await search(r.token, key, `${tag}a5`)).data?.[0];
  s.check("re-subida: a5 nueva aparece con precio 6", priceOf(a5) === 6, { price: a5?.price });
  const rev = await api("POST", `/providers/${key}/imports/${res.up.data?.id}/revert`, { token: r.token });
  s.check("revertir la última carga → 2xx REVERTED", rev.status < 300 && rev.data?.status === "REVERTED", rev);
  const a1r = (await search(r.token, key, `${tag}a1`)).data?.[0];
  const a5r = await search(r.token, key, `${tag}a5`);
  s.check("revertido: a1 vuelve a 12.5", priceOf(a1r) === 12.5, { price: a1r?.price });
  s.check("revertido: a5 (agregada por la carga revertida) deja de aparecer", (a5r.data?.length ?? 0) === 0, { count: a5r.data?.length, price: a5r.data?.[0]?.price }, {
    hint: "list-import.service.ts:582-595 revert (TENANT) borra/recrea OWN_LIST desde el snapshot, pero las fichas providerSyncCache creadas por la carga quedan y search() las muestra sin precio si no hay precios propios",
  });

  // Vigencia: listUpdateDays solo al crear.
  const c = await createListProvider(r.token, `Lista Vigencia ${ctx.prefix}`, { listUpdateDays: 7 });
  s.check("crear proveedor por lista con listUpdateDays=7 → 201", c.status === 201 && c.data?.listUpdateDays === 7, c);
  const fkey = c.data?.providerKey;
  const fr0 = await api("GET", `/providers/${fkey}/freshness`, { token: r.token });
  s.check("sin cargas: freshness NONE", fr0.data?.status === "NONE", fr0);
  const v5 = listVariants(`${tag}z`).find((v) => v.key === "V5");
  const up = await uploadAndApply(r.token, fkey, v5);
  const fr1 = await api("GET", `/providers/${fkey}/freshness`, { token: r.token });
  s.check("recién aplicada: freshness OK con expectedAt = +7 días", up.final.data?.status === "APPLIED" && fr1.data?.status === "OK", fr1);
  const cfgTry = await api("PUT", `/providers/${fkey}/config`, { token: r.token, body: { listUpdateDays: 15 } });
  const enableTry = await api("POST", "/providers/enable-own-list", { token: r.token, body: { listUpdateDays: 15 } });
  const cadenceTry = await api("PUT", `/providers/${fkey}/list-cadence`, { token: r.token, body: { listUpdateDays: 15 } });
  const fr1b = await api("GET", `/providers/${fkey}/freshness`, { token: r.token });
  // Vuelve a 7 para los chequeos de vencimiento de abajo.
  await api("PUT", `/providers/${fkey}/list-cadence`, { token: r.token, body: { listUpdateDays: 7 } });
  s.check("el comercio puede cambiar la vigencia (listUpdateDays) después de crear el proveedor", fr1b.data?.listUpdateDays === 15, { cadence: { http: cadenceTry.status, msg: cadenceTry.body?.message }, config: { http: cfgTry.status, msg: cfgTry.body?.message }, enableOwnList: { http: enableTry.status, msg: enableTry.body?.message }, listUpdateDays: fr1b.data?.listUpdateDays }, {
    hint: "Solo se fija en POST /providers (list-import.controller.ts:72). UpdateProviderConfigDto no tiene listUpdateDays y enable-own-list rechaza RETAILER (tenants.service.ts:279-281)",
  });
  await ctx.prisma.supplierListImport.updateMany({ where: { provider: fkey, status: "APPLIED" }, data: { appliedAt: new Date(Date.now() - 6 * DAY) } });
  const fr2 = await api("GET", `/providers/${fkey}/freshness`, { token: r.token });
  s.check("aplicada hace 6 días con cadencia 7 → DUE_SOON", fr2.data?.status === "DUE_SOON", fr2.data);
  await ctx.prisma.supplierListImport.updateMany({ where: { provider: fkey, status: "APPLIED" }, data: { appliedAt: new Date(Date.now() - 30 * DAY) } });
  const fr3 = await api("GET", `/providers/${fkey}/freshness`, { token: r.token });
  s.check("aplicada hace 30 días con cadencia 7 → OVERDUE", fr3.data?.status === "OVERDUE", fr3.data);
  const sr = await search(r.token, fkey, `${tag}ze1`);
  // Decisión del dueño: la lista vencida se sigue mostrando, con aviso.
  s.check("lista vencida → se sigue mostrando en búsqueda (con aviso de vencida)", (sr.data?.length ?? 0) >= 1, { count: sr.data?.length, price: sr.data?.[0]?.price });
  const prow = await myProvider(r.token, fkey);
  s.note(`lista vencida en /my/providers: ${JSON.stringify(compact(prow))} (sin campo de vigencia)`);
  const notes = await api("GET", "/my/notifications", { token: r.token });
  s.note(`/my/notifications tras vencer (el aviso lo crea un cron diario, apagado acá): ${notes.status} · ${JSON.stringify(notes.data ?? notes.body).slice(0, 200)}`);

  // Lista grande.
  const g = await createListProvider(r.token, `Lista Grande ${ctx.prefix}`);
  const big = bigList(`${tag}g`, 20_000);
  const sizeKb = Math.round(big.data.length / 1024);
  const res2 = await uploadAndApply(r.token, g.data?.providerKey, big, { timeoutMs: 300_000 });
  s.note(`20.000 filas (${sizeKb} KB): ${res2.first.data?.status} → ${res2.final.data?.status} en ${Math.round(res2.ms / 1000)} s (subida HTTP ${res2.up.status})`);
  s.check("20.000 filas → APPLIED en menos de 5 min", res2.final.data?.status === "APPLIED", { status: res2.final.data?.status, error: res2.final.data?.error, http: res2.up.status, body: res2.up.status >= 300 ? res2.up.body : undefined });
  const gi = 12345;
  const gh = (await search(r.token, g.data?.providerKey, `${tag}gg${gi}`)).data?.[0];
  s.check(`20k: la fila ${gi} aparece con su precio`, priceOf(gh) === big.samplePrice(gi), { price: gh?.price, expected: big.samplePrice(gi) });
}

// ---------- P5: proveedor compartido (ASHIR, sin API) entre dos comercios ----------

export async function p5SharedProvider(ctx) {
  const s = scenario("P5", "Proveedor compartido sin API (ASHIR): lista propia de un comercio vs. otro comercio");
  const a = ctx.pInt;
  const b = await newRetailer(ctx, "pint2", "PRO");
  const tag = `${ctx.pTag}sh`;
  const ca = await connectByListKey(a.token, "ASHIR", "Ashir");
  s.check("comercio A se conecta a ASHIR por lista → 201", ca.conn?.status === 201, ca.conn ?? ca.dir);
  const v1 = listVariants(tag).find((v) => v.key === "V1");
  const up = await uploadAndApply(a.token, "ASHIR", v1);
  s.check("A sube su lista de ASHIR → APPLIED", up.final.data?.status === "APPLIED", { first: up.first.data?.status, final: up.final.data?.status, reasons: up.first.data?.reviewReasons });
  const mine = (await search(a.token, "ASHIR", `${tag}a1`)).data?.[0];
  s.check("A ve su precio 12.5", priceOf(mine) === 12.5, { price: mine?.price });

  const cb = await connectByListKey(b.token, "ASHIR", "Ashir");
  s.check("comercio B se conecta a ASHIR por lista → 201", cb.conn?.status === 201, cb.conn ?? cb.dir);
  const rowB = await myProvider(b.token, "ASHIR");
  s.note(`B sin lista propia: /my/providers ASHIR → ${JSON.stringify(compact(rowB))}`);
  const sb = await search(b.token, "ASHIR", `${tag}a1`);
  s.check("[dueño] B (sin lista) no ve productos de la lista privada de A en búsqueda", (sb.data?.length ?? 0) === 0, { count: sb.data?.length, first: sb.data?.[0] && { name: sb.data[0].name, price: sb.data[0].price } }, {
    hint: "list-import.service.ts:490-501 applyTenant crea ofertas sin precio para los demás vinculados + search() suma fichas providerSyncCache (providers.service.ts:982-993)",
  });
  const prof = await api("GET", "/providers/ASHIR/import-profile", { token: b.token });
  const leaked = JSON.stringify(prof.data?.latestImport?.preview ?? {}).includes(tag) || JSON.stringify(prof.data?.active?.sampleRows ?? {}).includes(tag);
  s.check("B NO ve la planilla de A (preview/sampleRows con precios) en /providers/ASHIR/import-profile", !leaked, { status: prof.status, latestImport: prof.data?.latestImport && { file: prof.data.latestImport.originalFileName, rows: JSON.stringify(prof.data.latestImport.preview?.rows ?? []).slice(0, 200) } }, {
    hint: "list-import.service.ts:654-671 getProfile: latestImport filtra solo por provider (no por tenant) y el perfil (sampleRows) es por proveedor, compartido entre comercios",
  });
  const sug = await api("POST", "/providers/ASHIR/import-profile/suggest", { token: b.token });
  s.check("B (sin planillas propias) no puede pedir sugerencia sobre el archivo de A", sug.status >= 400, { status: sug.status, headers: sug.data?.headers }, {
    hint: "list-import.service.ts:782-794 suggestProfile toma la última planilla del proveedor de cualquier comercio",
  });
  // B pisa el perfil compartido: precio ← columna Stock.
  const headers = prof.data?.latestImport?.preview?.headers ?? ["SKU", "Descripción", "Precio", "Stock", "IVA", "Moneda"];
  const columnMap = Object.fromEntries(headers.map((h) => [h, null]));
  const hName = headers.find((h) => /descrip/i.test(h));
  const hStock = headers.find((h) => /stock/i.test(h));
  const hSku = headers.find((h) => /sku/i.test(h));
  if (hName) columnMap[hName] = "name";
  if (hStock) columnMap[hStock] = "price";
  if (hSku) columnMap[hSku] = "externalId";
  const save = await api("PUT", "/providers/ASHIR/import-profile", { token: b.token, body: { columnMap, numberFormat: "DOT" } });
  s.check("B NO puede reescribir el perfil de lectura que usa A", save.status >= 400, { status: save.status, version: save.data?.version }, {
    hint: "list-import.service.ts:705-752 saveProfile archiva el ACTIVE del proveedor (global) y crea uno nuevo con la huella del último archivo de cualquier comercio",
  });
  if (save.status < 300) {
    // Sin `apply`: se mira qué decide el sistema solo.
    const again = await uploadAndApply(a.token, "ASHIR", v1, { apply: false });
    const after = (await search(a.token, "ASHIR", `${tag}a1`)).data?.[0];
    s.check("A re-sube el MISMO archivo: no se aplica solo con el perfil de B", again.first.data?.status !== "APPLIED", { status: again.first.data?.status, reasons: again.first.data?.reviewReasons, priceVisible: after?.price });
    if (again.first.data?.status === "NEEDS_REVIEW") {
      s.note(`A re-sube: queda NEEDS_REVIEW solo por el umbral de cambio de precio (${(again.first.data?.reviewReasons ?? []).join(" | ")}); si A aprieta 'Aplicar', su precio pasa a ser el stock`);
      await api("POST", `/providers/ASHIR/imports/${again.up.data.id}/discard`, { token: a.token });
    }
    // Un comercio C nuevo, sin carga previa: no hay umbral de cambio contra qué comparar.
    const c = await newRetailer(ctx, "pint3", "PRO");
    await connectByListKey(c.token, "ASHIR", "Ashir");
    const tagC = `${tag}c`;
    const first = await uploadAndApply(c.token, "ASHIR", listVariants(tagC).find((v) => v.key === "V1"));
    const hit = (await search(c.token, "ASHIR", `${tagC}a1`)).data?.[0];
    s.check("comercio C (nuevo) sube y aplica su 1.ª lista con las mismas columnas → precio 12.5, no el stock", priceOf(hit) === 12.5, { primeraEvaluacion: first.first.data?.status, reasons: first.first.data?.reviewReasons, final: first.final.data?.status, price: hit?.price, stockDeLaFila: 40 }, {
      hint: "resolveProfile (list-import.service.ts:290-305) usa el ACTIVE global del proveedor; con huella EXACT y sin carga anterior evaluateSanity (sanity-checks.ts:18-35) no da motivos → applyImport automático",
    });
  }
  ctx.pShared = b;
}

/** P5 pisa el perfil compartido de ASHIR: lo deja como estaba para no ensuciar otras corridas. */
async function restoreProfile(ctx, provider, since, previousActiveId) {
  await ctx.prisma.importProfile.updateMany({ where: { provider, createdAt: { gte: since } }, data: { status: "ARCHIVED" } });
  if (previousActiveId) await ctx.prisma.importProfile.update({ where: { id: previousActiveId }, data: { status: "ACTIVE" } });
}

export async function p5SharedProviderIsolated(ctx) {
  const since = new Date();
  const prev = await ctx.prisma.importProfile.findFirst({ where: { provider: "ASHIR", status: "ACTIVE" }, select: { id: true } });
  try {
    await p5SharedProvider(ctx);
  } finally {
    await restoreProfile(ctx, "ASHIR", since, prev?.id ?? null);
  }
}

// ---------- P6: tope BASE ----------

export async function p6BaseLimit(ctx) {
  const s = scenario("P6", "Plan BASE (5 en búsqueda) con proveedores configurados y sin configurar");
  const r = await newRetailer(ctx, "pbase", "BASE");
  const tag = `${ctx.pTag}b`;
  const v5 = (t) => listVariants(t).find((v) => v.key === "V5");
  const configured = [];
  for (const suf of ["A", "B", "C", "D"]) {
    const c = await createListProvider(r.token, `Zulu ${suf} ${ctx.prefix}`);
    const key = c.data?.providerKey;
    const up = await uploadAndApply(r.token, key, v5(`${tag}${suf.toLowerCase()}`));
    if (up.final.data?.status === "APPLIED") configured.push(key);
  }
  s.check("BASE: 4 proveedores por lista configurados (con lista aplicada)", configured.length === 4, { configured });
  const lastZulu = configured[3];
  const before = await myProvider(r.token, lastZulu);
  s.check("con 4 proveedores, todos en búsqueda", before?.inSearch === true, { row: compact(before) });

  // Conectar dos integrados SIN configurar (nombres que ordenan antes que "Zulu").
  const air = await connectByListKey(r.token, "AIR", "Air");
  const elit = await connectByListKey(r.token, "ELIT", "Elit");
  s.check("BASE se conecta a AIR y ELIT (sin credenciales) → 201", air.conn?.status === 201 && elit.conn?.status === 201, { air: air.conn?.status, elit: elit.conn?.status });
  const list = (await api("GET", "/my/providers", { token: r.token })).data ?? [];
  const inSearch = list.filter((p) => p.inSearch).map((p) => p.provider);
  s.note(`BASE con 4 configurados + 2 sin configurar → en búsqueda: ${inSearch.join(", ")}`);
  const evicted = configured.filter((k) => !inSearch.includes(k));
  s.check("conectar proveedores SIN configurar no saca de búsqueda a uno configurado", evicted.length === 0, { evicted, inSearch }, {
    hint: "selectSearchProviders (packages/shared/src/plans.ts:482-491) ordena los 'sin tocar' por nombre: Air/Elit (vacíos) le ganan el lugar a 'Zulu D' (con lista) y nadie le avisa al comercio",
  });
  if (evicted[0]) {
    const sr = await search(r.token, evicted[0], `${tag}de1`);
    s.note(`el configurado desalojado (${evicted[0]}) → búsqueda devuelve ${sr.data?.length ?? sr.status} resultados`);
    const on = await api("PUT", `/my/providers/${evicted[0]}/search`, { token: r.token, body: { enabled: true } });
    s.check("prender el configurado desalojado con 5 activos → 409 PLAN_SEARCH_LIMIT", on.status === 409 && on.body?.code === "PLAN_SEARCH_LIMIT", on);
  }
  const usage = await api("GET", "/my/subscription", { token: r.token });
  s.note(`usage: ${JSON.stringify(usage.data?.usage)} — cuenta como 'conectados' y 'activos' a los que no tienen credenciales ni lista`);

  // Guardar credenciales de un 7.º proveedor no choca con el tope ni avisa.
  const inv = await connectByListKey(r.token, "INVID", "Invid");
  const cred = await api("POST", "/credentials", { token: r.token, body: { providerName: "INVID", credentials: { username: "falso", password: "falso" } } });
  const invRow = await myProvider(r.token, "INVID");
  s.note(`7.º proveedor (INVID) conectado + credenciales: connect ${inv.conn?.status}, credenciales ${cred.status}, inSearch=${invRow?.inSearch} (sin aviso de tope en ninguna de las dos respuestas)`);
  const cfg = await ctx.prisma.providerSyncConfig.findUnique({ where: { tenantId_provider: { tenantId: r.tenantId, provider: "INVID" } }, select: { priceChannel: true, enabled: true } });
  s.check("INVID con credenciales queda con canal API (para que el sync lo tome)", cfg?.priceChannel === "API", { cfg }, {
    hint: "connectByList (tenants.service.ts:365-369) fija priceChannel LIST y enabled=false; guardar credenciales no lo cambia → findDueConfigs (providers.service.ts:2130-2134) nunca lo sincroniza",
  });

  // BASE durante el onboarding: los DEMO ocupan 2 de los 5 lugares.
  const r2 = await newRetailer(ctx, "pbase2", "BASE", { complete: false });
  const mine = [];
  for (const suf of ["A", "B", "C", "D"]) {
    const c = await createListProvider(r2.token, `Yankee ${suf} ${ctx.prefix}`);
    const key = c.data?.providerKey;
    if (!key) continue;
    const up = await uploadAndApply(r2.token, key, v5(`${tag}y${suf.toLowerCase()}`));
    if (up.final.data?.status === "APPLIED") mine.push(key);
  }
  s.check("BASE en onboarding: 4 listas propias aplicadas", mine.length === 4, { mine });
  const l2 = (await api("GET", "/my/providers", { token: r2.token })).data ?? [];
  const in2 = l2.filter((p) => p.inSearch).map((p) => p.provider);
  const mineOut = mine.filter((k) => !in2.includes(k));
  s.check("BASE en onboarding: los 2 DEMO no ocupan lugares de los proveedores propios", mineOut.length === 0, { inSearch: in2, propiosFuera: mineOut }, {
    hint: "listFor incluye LIST_DEMO_* mientras viewerSeesDemoCatalog (tenant-visibility.service.ts:168,223) y entran al tope igual que los reales",
  });
  await completeOnboarding(r2);
  const l3 = (await api("GET", "/my/providers", { token: r2.token })).data ?? [];
  const in3 = l3.filter((p) => p.inSearch).map((p) => p.provider);
  s.check("BASE completado: los 4 propios quedan en búsqueda", mine.every((k) => in3.includes(k)), { inSearch: in3 });
}

/** Desconectarse de un proveedor y volver a conectarse. */
export async function p7Disconnect(ctx) {
  const s = scenario("P7", "Desconectar un proveedor y volver a conectarlo");
  const r = await newRetailer(ctx, "pdisc", "PRO");
  const v5 = listVariants(`${ctx.pTag}x`).find((v) => v.key === "V5");
  const q = Object.keys(v5.expect)[0];
  const c = await createListProvider(r.token, `Xray ${ctx.prefix}`);
  const key = c.data?.providerKey;
  const up = await uploadAndApply(r.token, key, v5);
  const row0 = await myProvider(r.token, key);
  s.check("lista aplicada → configurado y en búsqueda", up.final.data?.status === "APPLIED" && row0?.inSearch === true, { status: up.final.data?.status, row: row0 && { configured: row0.configured, inSearch: row0.inSearch } });
  const before = await search(r.token, key, q);
  s.check("antes de desconectar la búsqueda trae el producto", (before.data?.length ?? 0) >= 1, { status: before.status, count: before.data?.length });
  const disc = await api("DELETE", `/my/providers/${key}`, { token: r.token });
  s.check("DELETE /my/providers/:p → 200", disc.status === 200 && disc.data?.disconnected === true, disc);
  const row = await myProvider(r.token, key);
  s.check("después de desconectar no figura vinculado", !row || row.linked === false, { row });
  const after = await search(r.token, key, q);
  s.check("después de desconectar la búsqueda no trae nada", (after.data?.length ?? 0) === 0, { status: after.status, count: after.data?.length });
  const again = await api("DELETE", `/my/providers/${key}`, { token: r.token });
  s.check("desconectar dos veces → 404", again.status === 404, again);
  const demo = await api("DELETE", "/my/providers/LIST_DEMO_NORTE", { token: r.token });
  s.check("los demos no se desconectan a mano (400/404)", demo.status === 400 || demo.status === 404, demo);
  const blocked = await uploadFile(r.token, key, v5);
  s.check("desconectado no puede subir lista sin reconectarse (403/404)", blocked.status === 403 || blocked.status === 404, { status: blocked.status });
  const re = await connectByListKey(r.token, key, `Xray ${ctx.prefix}`);
  s.check("se reconecta buscándolo en el directorio → conectar por lista", (re.conn?.status ?? 0) < 300 && re.conn !== null, { dir: re.dir?.status, found: Boolean(re.row), conn: re.conn?.status });
  const up2 = await uploadAndApply(r.token, key, v5);
  const row2 = await myProvider(r.token, key);
  s.check("volver a subir la lista lo reconecta y vuelve a la búsqueda", up2.final.data?.status === "APPLIED" && row2?.linked === true && row2?.inSearch === true, { status: up2.final.data?.status, upload: up2.up?.status, row: row2 && { linked: row2.linked, configured: row2.configured, inSearch: row2.inSearch } });
}

export const providerScenarios = [p1OnboardingDemo, p2Integrated, p3ListVariants, p4ReuploadFreshness, p5SharedProviderIsolated, p6BaseLimit, p7Disconnect];
