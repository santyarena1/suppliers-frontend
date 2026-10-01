// Simulación E2E de un usuario nuevo de NODO contra el API LOCAL.
//
// Uso (desde apps/api):
//   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/nodo_test2 \
//   SIM_BASE_URL=http://127.0.0.1:8091 SIM_API_LOG=<log del API> \
//   [SIM_OUT=<reporte.json>] node test-e2e-sim/run.mjs
//
// El API tiene que estar corriendo sin RESEND/SMTP (el código de mail sale por
// el log) y sin TURNSTILE_SECRET_KEY. Crea datos con prefijo sim-<timestamp>.
import { writeFileSync } from "node:fs";
import prismaPkg from "@prisma/client";
import argon2 from "argon2";
import { api, results, serverErrors, sleep, scenario } from "./lib.mjs";
import { s1Register, s2Onboarding, s3Session, s4Team, s4bTeamRemoval, s5Security, s5bCrossOrg } from "./scenarios-auth.mjs";
import { s6Link, s7PriceList, s8CartOrder, s9Plan } from "./scenarios-commerce.mjs";

const { PrismaClient } = prismaPkg;
const SESSION_CACHE_WAIT_MS = 31_000;

async function createAdmin(ctx) {
  const username = `${ctx.prefix}-adm`;
  const password = "Sim-Admin-Pass1!";
  await ctx.prisma.user.create({
    data: {
      username,
      email: `${username}@sim.nodo.test`,
      passwordHash: await argon2.hash(password),
      role: "ROLE_ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  const login = await api("POST", "/auth/login", { body: { username, password } });
  if (login.status !== 200) throw new Error(`no entra el superadmin de prueba: ${JSON.stringify(login.body)}`);
  return { username, token: login.data.token };
}

/** Entradas raras contra endpoints varios: cualquier 5xx es un hallazgo. */
async function s10Probes(ctx) {
  const s = scenario("S10", "Entradas inválidas: ningún 5xx");
  const { base, dist } = ctx;
  const probes = [
    [dist.token, "GET", "/my/clients/no-es-uuid"],
    [dist.token, "PUT", "/my/clients/no-es-uuid", { discountPercent: 5 }],
    [dist.token, "GET", "/cart/clients/no-es-uuid"],
    [dist.token, "DELETE", "/my/access-codes/no-es-uuid"],
    [dist.token, "GET", "/my/clients/orders?linkId=no-es-uuid"],
    [dist.token, "GET", `/providers/${dist.providerKey}/imports/no-es-uuid`],
    [dist.token, "POST", `/providers/${dist.providerKey}/imports/no-es-uuid/apply`],
    [dist.token, "POST", "/my/redeem-code", { code: "XXXX" }],
    [base.token, "PATCH", "/orders/no-es-uuid", { notes: "x" }],
    [base.token, "POST", "/orders/no-es-uuid/approve"],
    [base.token, "PUT", "/my/team/no-es-uuid", { role: "VIEWER" }],
    [base.token, "POST", "/my/team/no-es-uuid/password"],
    [base.token, "PUT", "/my/team/no-es-uuid/managed-brands", { brandNames: ["x"] }],
    [base.token, "POST", "/my/redeem-code", { code: "" }],
    [base.token, "POST", "/my/redeem-code", { code: 12345 }],
    [base.token, "POST", "/my/suppliers/no-es-uuid/connect-by-list"],
    [base.token, "POST", `/my/suppliers/${ctx.owner.tenantId}/connect-by-list`],
    [base.token, "GET", "/my/suppliers/search?q=%25_%25"],
    [base.token, "POST", "/providers", { name: "!!!", type: "DISTRIBUTOR" }],
    [base.token, "POST", "/providers", { name: `SimDist ${ctx.prefix}`, type: "DISTRIBUTOR" }],
    [base.token, "PUT", "/my/providers/LIST_NO_EXISTE/search", { enabled: true }],
    [base.token, "PUT", "/cart/org", { items: "no-array" }],
    [base.token, "PATCH", "/cart/items/no-es-uuid", { quantity: 2 }],
    [base.token, "POST", "/cart/items", { provider: dist.providerKey, externalId: "x", name: "x", price: "abc", imageUrl: "", quantity: 0 }],
    [base.token, "POST", "/orders/offline", { orders: [{ provider: dist.providerKey, items: [{ externalId: "x", name: "x", qty: 0, unitPrice: 1 }] }] }],
    [base.token, "POST", "/orders/offline", { orders: [{ provider: dist.providerKey, items: [{ externalId: "x", name: "x", qty: 1, unitPrice: 1e308, pricingMode: "list" }] }] }],
    [base.token, "POST", "/orders/offline", { orders: [] }],
    [base.token, "GET", `/search/provider/${dist.providerKey}?name=%25%25%25`],
    [base.token, "GET", `/providers/${dist.providerKey}/catalog?take=-1&skip=-5`],
    [base.token, "GET", `/providers/${dist.providerKey}/catalog?take=999999`],
    [base.token, "GET", `/providers/${dist.providerKey}/products/no-existe`],
    [base.token, "GET", `/providers/${dist.providerKey}/products/no-existe/price-history?from=ayer&to=hoy`],
    [base.token, "GET", "/catalog/by-category?category="],
    [base.token, "GET", "/catalog/featured?take=abc"],
    [base.token, "POST", "/onboarding/bootstrap", { name: "   " }],
    [base.token, "POST", "/onboarding/step", { step: "" }],
    [base.token, "POST", "/my/subscription/request", { plan: "NADA" }],
    [ctx.third.token, "GET", "/orders/pending-approval"],
    [null, "POST", "/auth/verify-email", { email: "no-es-mail", code: 123 }],
    [null, "POST", "/auth/register", { username: "ab", email: "x", password: "x", extra: 1 }],
    [null, "POST", "/auth/login", { username: { $ne: "" }, password: { $ne: "" } }],
    [null, "POST", "/auth/google", { idToken: "basura" }],
    [null, "GET", "/my/org"],
  ];
  for (const [token, m, path, body] of probes) {
    const r = await api(m, path, { token: token ?? undefined, body });
    s.check(`${m} ${path} → sin 5xx (${r.status})`, r.status < 500, r);
  }
  const rawBad = await api("POST", "/auth/login", { raw: "{username:" });
  s.check("JSON mal formado → 400", rawBad.status === 400, rawBad);
  const noFile = await api("POST", `/providers/${dist.providerKey}/imports`, { token: dist.token, body: {} });
  s.check("subir planilla sin archivo → 4xx", noFile.status >= 400 && noFile.status < 500, noFile);
  const form = new FormData();
  form.append("file", new Blob(["hola"], { type: "text/plain" }), "virus.exe");
  const badExt = await api("POST", `/providers/${dist.providerKey}/imports`, { token: dist.token, form });
  s.check("subir planilla .exe → 400", badExt.status === 400, badExt);
  const upg = await api("POST", "/my/subscription/upgrade", { token: base.token, body: { plan: "PRO" } });
  s.note(`BASE en prueba → upgrade a PRO self-serve: ${upg.status} applied=${upg.data?.applied} plan=${upg.data?.subscription?.plan}`);
}

function report(started) {
  const lines = ["", "================ RESUMEN ================", ""];
  lines.push("| Escenario | PASA | FALLA | Notas |", "|---|---|---|---|");
  for (const s of results) {
    const pass = s.checks.filter((c) => c.ok === true).length;
    const fail = s.checks.filter((c) => c.ok === false).length;
    const notes = s.checks.filter((c) => c.ok === null).length;
    lines.push(`| ${s.id} ${s.title} | ${pass} | ${fail} | ${notes} |`);
  }
  lines.push("", "---- FALLAS ----");
  for (const s of results) {
    for (const c of s.checks.filter((x) => x.ok === false)) {
      lines.push(`* [${s.id}] ${c.name}`, `    evidencia: ${JSON.stringify(c.evidence).slice(0, 900)}`);
      if (c.hint) lines.push(`    probable: ${c.hint}`);
    }
  }
  lines.push("", "---- NOTAS ----");
  for (const s of results) for (const c of s.checks.filter((x) => x.ok === null)) lines.push(`* [${s.id}] ${c.name}`);
  lines.push("", `---- 5xx (${serverErrors.length}) ----`);
  for (const e of serverErrors) lines.push(`* ${e.request} → ${e.status} ${JSON.stringify(e.response).slice(0, 400)} body=${JSON.stringify(e.requestBody ?? null).slice(0, 300)}`);
  lines.push("", `Duración: ${Math.round((Date.now() - started) / 1000)} s`);
  console.log(lines.join("\n"));
  if (process.env.SIM_OUT) writeFileSync(process.env.SIM_OUT, JSON.stringify({ results, serverErrors }, null, 2));
}

async function main() {
  const started = Date.now();
  const stamp = String(Date.now());
  const ctx = { stamp, prefix: `sim-${stamp}`, prisma: new PrismaClient(), deferred: [] };
  const health = await api("GET", "/health");
  if (health.status !== 200) throw new Error(`API no responde: ${health.status}`);
  console.log(`Simulación ${ctx.prefix} contra ${process.env.SIM_BASE_URL ?? "http://127.0.0.1:8091"}`);
  try {
    ctx.admin = await createAdmin(ctx);
    const steps = [s1Register, s2Onboarding, s3Session, s4Team, s5Security];
    for (const step of steps) await runStep(step, ctx);
    const deferredFrom = Date.now();
    for (const step of [s6Link, s7PriceList, s8CartOrder, s4bTeamRemoval, s5bCrossOrg, s9Plan, s10Probes]) await runStep(step, ctx);
    const wait = SESSION_CACHE_WAIT_MS - (Date.now() - deferredFrom);
    if (wait > 0) await sleep(wait);
    const late = scenario("S-diferidos", "Chequeos 31 s después (caché de sesión)");
    for (const fn of ctx.deferred) await fn().catch((err) => late.check("chequeo diferido", false, String(err)));
  } finally {
    await ctx.prisma.$disconnect();
    report(started);
  }
}

async function runStep(step, ctx) {
  try {
    await step(ctx);
  } catch (err) {
    const s = scenario(`${step.name}!`, "Excepción del script");
    s.check(`el escenario ${step.name} terminó sin excepción`, false, String(err?.stack ?? err).slice(0, 600));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
