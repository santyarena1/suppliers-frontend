// Escenarios 1 a 5: registro, onboarding, sesión, equipo y seguridad.
import { api, codeFromLog, logLength, near, scenario, sleep } from "./lib.mjs";

const DAY = 86_400_000;

/** Registra y verifica una cuenta (camino feliz), devuelve { token, userId }. */
export async function registerVerified(ctx, suffix) {
  const username = `${ctx.prefix}-${suffix}`;
  const email = `${username}@sim.nodo.test`;
  const password = `Sim-${suffix}-Pass1!`;
  const reg = await api("POST", "/auth/register", { body: { username, email, password } });
  if (reg.status !== 201) throw new Error(`register ${username}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const found = await codeFromLog(email);
  if (!found) throw new Error(`sin código en el log para ${email}`);
  const ver = await api("POST", "/auth/verify-email", { body: { email, code: found.code } });
  if (ver.status !== 200) throw new Error(`verify ${username}: ${ver.status} ${JSON.stringify(ver.body)}`);
  return { username, email, password, token: ver.data.token, userId: reg.data.id };
}

export async function s1Register(ctx) {
  const s = scenario("S1", "Registro y verificación de email");
  const username = `${ctx.prefix}-own`;
  const email = `${username}@sim.nodo.test`;
  const password = "Sim-Owner-Pass1!";

  const reg = await api("POST", "/auth/register", { body: { username, email, password } });
  s.check("register → 201 sin JWT y needsVerification", reg.status === 201 && reg.data?.needsVerification === true && !reg.data?.token, reg);

  const login = await api("POST", "/auth/login", { body: { username, password } });
  s.check("login antes de verificar → 403 EMAIL_NOT_VERIFIED", login.status === 403 && login.body?.code === "EMAIL_NOT_VERIFIED", login);

  const dupUser = await api("POST", "/auth/register", { body: { username, email: `x-${email}`, password } });
  s.check("register con username tomado → 409", dupUser.status === 409, dupUser);
  const dupMail = await api("POST", "/auth/register", { body: { username: `${username}-b`, email: email.toUpperCase(), password } });
  s.check("register con email tomado (otra capitalización) → 409", dupMail.status === 409, dupMail);
  const weak = await api("POST", "/auth/register", { body: { username: `${username}-w`, email: `w-${email}`, password: "123" } });
  s.check("register con contraseña corta → 400", weak.status === 400, weak);

  const first = await codeFromLog(email);
  s.check("el código de verificación sale por el log (sin mail configurado)", Boolean(first), { found: Boolean(first) });
  const wrong = first && first.code === "000000" ? "111111" : "000000";
  const attempts = [];
  for (let i = 0; i < 5; i++) attempts.push(await api("POST", "/auth/verify-email", { body: { email, code: wrong } }));
  s.check("5 códigos incorrectos → 400 cada uno", attempts.every((a) => a.status === 400), attempts[4]);
  const blocked = await api("POST", "/auth/verify-email", { body: { email, code: first?.code ?? "" } });
  s.check("después de 5 fallos el código correcto queda bloqueado → 400", blocked.status === 400 && !blocked.data?.token, blocked);

  const cooldown = await api("POST", "/auth/resend-verification", { body: { email } });
  s.check("reenvío inmediato → 400 RESEND_COOLDOWN", cooldown.status === 400 && cooldown.body?.code === "RESEND_COOLDOWN", cooldown);
  const unknown = await api("POST", "/auth/resend-verification", { body: { email: `nadie-${email}` } });
  if (cooldown.status === 400 && unknown.status === 200) {
    s.note(
      "Enumeración: resend-verification responde 200 {sent:true} para un mail inexistente pero 400 RESEND_COOLDOWN para uno registrado sin verificar (auth.service.ts:117-125 + issueVerificationCode:356). Contradice el comentario 'no se enumera'.",
      { inexistente: unknown.status, registrado: cooldown.status }
    );
  }

  // El cooldown es de 60 s: se corre la marca del último envío en la base para no esperar.
  await ctx.prisma.emailChallenge.updateMany({
    where: { user: { email } },
    data: { lastSentAt: new Date(Date.now() - 61_000) },
  });
  const before = logLength();
  const resend = await api("POST", "/auth/resend-verification", { body: { email } });
  s.check("reenvío pasado el cooldown → 200 sent", resend.status === 200 && resend.data?.sent === true, resend);
  const second = await codeFromLog(email, { after: before });
  s.check("el reenvío emite un código nuevo", Boolean(second), { found: Boolean(second) });

  const ok = await api("POST", "/auth/verify-email", { body: { email, code: second?.code ?? "" } });
  s.check("código correcto → 200 con JWT", ok.status === 200 && typeof ok.data?.token === "string", ok);
  const reuse = await api("POST", "/auth/verify-email", { body: { email, code: second?.code ?? "" } });
  s.check("reusar el código ya consumido → 400", reuse.status === 400, reuse);
  const login2 = await api("POST", "/auth/login", { body: { username, password } });
  s.check("login después de verificar → 200 con JWT", login2.status === 200 && typeof login2.data?.token === "string", login2);
  const byEmail = await api("POST", "/auth/login", { body: { username: email, password } });
  if (byEmail.status !== 200) s.note("El login es solo por username: con el email responde 'Usuario o contraseña incorrectos' (auth.service.ts:76). Un usuario nuevo puede esperar entrar con su mail.", byEmail);

  ctx.owner = { username, email, password, token: login2.data?.token, userId: reg.data?.id };
}

export async function s2Onboarding(ctx) {
  const s = scenario("S2", "Onboarding y prueba de 14 días (PRO y BASE)");
  const o = ctx.owner;
  const st = await api("GET", "/onboarding/status", { token: o.token });
  s.check("estado inicial: needsOnboarding, sin org, canBootstrap", st.status === 200 && st.data?.needsOnboarding === true && st.data?.hasTenant === false && st.data?.canBootstrap === true, st);
  const noOrg = await api("GET", "/my/providers", { token: o.token });
  s.check("sin organización, /my/providers → 403 claro (no 5xx)", noOrg.status === 403, noOrg);

  const name = `Comercio ${ctx.prefix} Pro`;
  const t0 = Date.now();
  const boot = await api("POST", "/onboarding/bootstrap", { token: o.token, body: { name, trialPlan: "PRO" } });
  s.check("bootstrap PRO → 201 con token nuevo y org", boot.status === 201 && boot.data?.token && boot.data?.org?.plan === "PRO", boot);
  o.token = boot.data?.token ?? o.token;
  o.tenantId = boot.data?.org?.id;

  const sub = await ctx.prisma.subscription.findUnique({ where: { tenantId: o.tenantId ?? "" } });
  s.check("suscripción TRIAL en la base", sub?.status === "TRIAL", { sub });
  s.check("trialEndsAt ≈ ahora + 14 días", sub?.trialEndsAt && near(sub.trialEndsAt, t0 + 14 * DAY, 10 * 60_000), { trialEndsAt: sub?.trialEndsAt });

  const again = await api("POST", "/onboarding/bootstrap", { token: o.token, body: { name: `${name} 2`, trialPlan: "PRO" } });
  s.check("segundo bootstrap → 409", again.status === 409, again);

  const mine = await api("GET", "/my/subscription", { token: o.token });
  const capPro = mine.data?.capabilities ?? {};
  s.check("/my/subscription PRO: TRIAL, plan PRO, acceso FULL", mine.status === 200 && mine.data?.status === "TRIAL" && mine.data?.plan === "PRO" && mine.data?.access === "FULL", mine);
  s.check("capabilities PRO: sin tope de búsqueda, checkout, chat, analytics", capPro.maxSearchProviders === null && capPro.directCheckout && capPro.integratedChat && capPro.advancedAnalytics, { capPro });
  const insightsPro = await api("GET", "/orders/insights", { token: o.token });
  s.check("PRO: /orders/insights (analytics) → 200", insightsPro.status === 200, insightsPro);
  const chatPro = await api("GET", "/my/chat/threads", { token: o.token });
  s.check("PRO: /my/chat/threads → 200", chatPro.status === 200, chatPro);

  // Segundo comercio con BASE.
  const b = await registerVerified(ctx, "base");
  const bootB = await api("POST", "/onboarding/bootstrap", { token: b.token, body: { name: `Comercio ${ctx.prefix} Base`, trialPlan: "BASE" } });
  s.check("bootstrap BASE → 201 plan BASE", bootB.status === 201 && bootB.data?.org?.plan === "BASE", bootB);
  b.token = bootB.data?.token ?? b.token;
  b.tenantId = bootB.data?.org?.id;
  ctx.base = b;
  const subB = await ctx.prisma.subscription.findUnique({ where: { tenantId: b.tenantId ?? "" } });
  s.check("BASE: TRIAL y trialEndsAt a 14 días", subB?.status === "TRIAL" && subB.trialEndsAt && near(subB.trialEndsAt, Date.now() + 14 * DAY, 10 * 60_000), { subB });
  const mineB = await api("GET", "/my/subscription", { token: b.token });
  const capB = mineB.data?.capabilities ?? {};
  s.check("capabilities BASE: tope 5, sin checkout/chat/analytics", capB.maxSearchProviders === 5 && !capB.directCheckout && !capB.integratedChat && !capB.advancedAnalytics, { capB, usage: mineB.data?.usage });
  const insightsB = await api("GET", "/orders/insights", { token: b.token });
  s.check("BASE: /orders/insights → 403 PLAN_FEATURE_UNAVAILABLE", insightsB.status === 403 && insightsB.body?.code === "PLAN_FEATURE_UNAVAILABLE", insightsB);
  const chatB = await api("GET", "/my/chat/threads", { token: b.token });
  s.check("BASE: /my/chat/threads → 403 PLAN_FEATURE_UNAVAILABLE", chatB.status === 403 && chatB.body?.code === "PLAN_FEATURE_UNAVAILABLE", chatB);
  const checkoutB = await api("GET", "/providers/INVID/checkout/addresses", { token: b.token });
  s.check("BASE: checkout directo (INVID addresses) → 403 PLAN_FEATURE_UNAVAILABLE", checkoutB.status === 403 && checkoutB.body?.code === "PLAN_FEATURE_UNAVAILABLE", checkoutB);

  // Sin trialPlan → BASE; nombre repetido con otra capitalización → 409.
  const c = await registerVerified(ctx, "nopl");
  const dupName = await api("POST", "/onboarding/bootstrap", { token: c.token, body: { name: name.toUpperCase() } });
  s.check("bootstrap con nombre de comercio existente (otra capitalización) → 409", dupName.status === 409, dupName);
  if (dupName.status === 409) s.note("El nombre del comercio es único en TODA la plataforma (onboarding.service.ts:160-164): dos locales homónimos de ciudades distintas no pueden registrarse, y el 409 revela que la otra org existe.", dupName);

  // Doble click: dos bootstrap simultáneos del mismo usuario.
  const [r1, r2] = await Promise.all([
    api("POST", "/onboarding/bootstrap", { token: c.token, body: { name: `Comercio ${ctx.prefix} Race A` } }),
    api("POST", "/onboarding/bootstrap", { token: c.token, body: { name: `Comercio ${ctx.prefix} Race B` } }),
  ]);
  const memberships = await ctx.prisma.tenantMembership.count({ where: { userId: c.userId } });
  s.check("doble bootstrap simultáneo → una sola organización", memberships === 1, { statuses: [r1.status, r2.status], memberships, r1: r1.body?.message ?? r1.data?.org, r2: r2.body?.message ?? r2.data?.org });
  const okBoot = [r1, r2].find((r) => r.status === 201);
  s.check("bootstrap sin trialPlan → plan BASE", okBoot?.data?.org?.plan === "BASE", okBoot ?? r1);
  c.token = okBoot?.data?.token ?? c.token;
  c.tenantId = okBoot?.data?.org?.id;
  ctx.third = c;
}

export async function s3Session(ctx) {
  const s = scenario("S3", "Sesión: org, permisos, proveedores, envíos, refresh");
  const o = ctx.owner;
  const org = await api("GET", "/my/org", { token: o.token });
  s.check("/my/org → 200 RETAILER, OWNER, plan PRO", org.status === 200 && org.data?.type === "RETAILER" && org.data?.tenantRole === "OWNER" && org.data?.plan === "PRO", org);
  const perms = await api("GET", "/my/permissions", { token: o.token });
  s.check("/my/permissions → 200 OWNER con team.manage", perms.status === 200 && perms.data?.role === "OWNER" && perms.data?.permissions?.includes("team.manage"), perms);
  const mePerms = await api("GET", "/me/permissions", { token: o.token });
  s.check("/me/permissions → 200", mePerms.status === 200, mePerms);
  const provs = await api("GET", "/my/providers", { token: o.token });
  s.check("/my/providers → 200 lista (con los 2 distribuidores demo)", provs.status === 200 && Array.isArray(provs.data), provs);
  s.note(`Tras el bootstrap el comercio ya tiene ${provs.data?.length ?? "?"} proveedores (demo): ${(provs.data ?? []).map((p) => p.provider).join(", ")}`);

  // Comercio sin ningún vínculo: se borran los vínculos demo del tercer comercio.
  await ctx.prisma.tenantLink.deleteMany({ where: { clientTenantId: ctx.third.tenantId } });
  const empty = await api("GET", "/my/providers", { token: ctx.third.token });
  s.check("comercio sin vínculos → /my/providers 200 []", empty.status === 200 && Array.isArray(empty.data) && empty.data.length === 0, empty);
  const subEmpty = await api("GET", "/my/subscription", { token: ctx.third.token });
  s.check("comercio sin vínculos → /my/subscription 200", subEmpty.status === 200, subEmpty);
  const ship = await api("GET", "/my/shipping-estimates", { token: o.token });
  s.check("/my/shipping-estimates → 200", ship.status === 200, ship);
  const ship3 = await api("GET", "/my/shipping-estimates", { token: ctx.third.token });
  s.check("/my/shipping-estimates sin vínculos → 200", ship3.status === 200, ship3);
  const status = await api("GET", "/onboarding/status", { token: o.token });
  s.check("/onboarding/status con org → hasTenant y mode", status.status === 200 && status.data?.hasTenant === true, status);
  const step = await api("POST", "/onboarding/step", { token: o.token, body: { step: "no-existe" } });
  s.check("/onboarding/step con paso inválido → 400", step.status === 400, step);
  const done = await api("POST", "/onboarding/complete", { token: o.token });
  s.check("/onboarding/complete → 2xx", done.status < 300, done);

  const ref = await api("POST", "/auth/refresh", { token: o.token });
  s.check("/auth/refresh → token nuevo", ref.status === 200 && typeof ref.data?.token === "string", ref);
  const afterRef = await api("GET", "/my/org", { token: ref.data?.token });
  s.check("el token renovado sirve", afterRef.status === 200, afterRef);
  const anon = await api("POST", "/auth/refresh");
  s.check("/auth/refresh sin token → 401", anon.status === 401, anon);
}

export async function s4Team(ctx) {
  const s = scenario("S4", "Equipo: vendedor, permisos, reset de clave, baja");
  const o = ctx.owner;
  const memberUser = `${ctx.prefix}-sell`;
  const memberPass = "Sim-Seller-Pass1!";
  const badRole = await api("POST", "/my/team", { token: o.token, body: { username: `${memberUser}-pm`, email: `${memberUser}-pm@sim.nodo.test`, password: memberPass, role: "PRODUCT_MANAGER" } });
  s.check("rol que no aplica a un comercio (PRODUCT_MANAGER) → 400", badRole.status === 400, badRole);
  const add = await api("POST", "/my/team", { token: o.token, body: { username: memberUser, email: `${memberUser}@sim.nodo.test`, password: memberPass, role: "SELLER", title: "Vendedor" } });
  s.check("dueño crea un SELLER → 201", add.status === 201 && add.data?.tenantRole === "SELLER", add);
  const membershipId = add.data?.membershipId;
  const genPass = await api("POST", "/my/team", { token: o.token, body: { username: `${memberUser}-g`, email: `${memberUser}-g@sim.nodo.test`, role: "VIEWER" } });
  s.check("alta sin contraseña → devuelve generatedPassword", genPass.status === 201 && typeof genPass.data?.generatedPassword === "string", genPass);

  const login = await api("POST", "/auth/login", { body: { username: memberUser, password: memberPass } });
  s.check("el SELLER entra (email ya verificado por el alta)", login.status === 200, login);
  let mTok = login.data?.token;
  const mPerms = await api("GET", "/my/permissions", { token: mTok });
  s.check("SELLER: sin team.manage ni providers.manage", mPerms.status === 200 && !mPerms.data?.permissions?.includes("team.manage") && !mPerms.data?.permissions?.includes("providers.manage"), mPerms);
  const mAdd = await api("POST", "/my/team", { token: mTok, body: { username: `${memberUser}-x`, email: `${memberUser}-x@sim.nodo.test`, password: memberPass, role: "OWNER" } });
  s.check("SELLER no puede crear miembros → 403", mAdd.status === 403, mAdd);
  const mMatrix = await api("GET", "/my/team/permissions", { token: mTok });
  s.check("SELLER no ve la matriz de permisos → 403", mMatrix.status === 403, mMatrix);
  const ownerMembership = (await ctx.prisma.tenantMembership.findFirst({ where: { userId: o.userId } }))?.id;
  const mReset = await api("POST", `/my/team/${ownerMembership}/password`, { token: mTok });
  s.check("SELLER no puede resetear la clave del dueño → 403", mReset.status === 403, mReset);
  const mCred = await api("POST", "/credentials", { token: mTok, body: { providerName: "INVID", credentials: { user: "x", password: "y" } } });
  s.check("SELLER no carga credenciales → 403", mCred.status === 403, mCred);
  const mSearch = await api("PUT", "/my/providers/LIST_DEMO_NORTE/search", { token: mTok, body: { enabled: false } });
  s.check("SELLER no cambia proveedores en búsqueda → 403", mSearch.status === 403, mSearch);
  const mUpg = await api("POST", "/my/subscription/upgrade", { token: mTok, body: { plan: "CUSTOM" } });
  s.check("SELLER no cambia el plan → 403", mUpg.status === 403, mUpg);
  const mOrg = await api("PUT", "/my/org", { token: mTok, body: { contactPhone: "123" } });
  s.check("SELLER no edita los datos de la org → 403", mOrg.status === 403, mOrg);
  const mTeam = await api("GET", "/my/team", { token: mTok });
  s.check("SELLER ve el equipo pero canManage=false", mTeam.status === 200 && mTeam.data?.canManage === false, mTeam);
  ctx.seller = { username: memberUser, password: memberPass, membershipId, userId: add.data?.userId };

  // Reset de contraseña: la sesión anterior tiene que morir.
  await api("GET", "/my/org", { token: mTok }); // la sesión queda "caliente" en la caché del JWT
  const reset = await api("POST", `/my/team/${membershipId}/password`, { token: o.token });
  s.check("dueño resetea la clave del SELLER → generatedPassword", reset.status < 300 && typeof reset.data?.generatedPassword === "string", reset);
  const oldNow = await api("GET", "/my/org", { token: mTok });
  s.check("token anterior inmediatamente después del reset → 401", oldNow.status === 401, oldNow, {
    hint: "jwt.strategy.ts:28-70 cachea active/sessionVersion 30 s por proceso y el reset (tenants.service.ts:789-806) no invalida esa caché",
  });
  const oldTok = mTok;
  ctx.resetAt = Date.now();
  ctx.deferred.push(async () => {
    const later = await api("GET", "/my/org", { token: oldTok });
    s.check("token anterior 31 s después del reset → 401", later.status === 401, later);
  });
  const oldPass = await api("POST", "/auth/login", { body: { username: memberUser, password: memberPass } });
  s.check("la contraseña vieja ya no entra → 401", oldPass.status === 401, oldPass);
  const newLogin = await api("POST", "/auth/login", { body: { username: memberUser, password: reset.data?.generatedPassword ?? "" } });
  s.check("la contraseña generada entra", newLogin.status === 200, newLogin);
  mTok = newLogin.data?.token;
  const fresh = await api("GET", "/my/org", { token: mTok });
  s.check("token NUEVO (login con la clave generada) sirve enseguida → 200", fresh.status === 200, fresh, {
    hint: "jwt.strategy.ts:56-70: la caché de 30 s guarda la sessionVersion vieja; el token nuevo (sv+1) se rechaza hasta que vence",
  });
  ctx.seller.token = mTok;
  ctx.seller.password = reset.data?.generatedPassword;
}

/** Pasos de equipo que dependen de que exista un pedido (se corren después de S8). */
export async function s4bTeamRemoval(ctx) {
  const s = scenario("S4b", "Equipo: pedido del vendedor y baja del miembro");
  const o = ctx.owner;
  const seller = ctx.seller;
  // Se espera a que venza la caché de sesión (30 s) para probar la lógica real, no la caché.
  const wait = 31_000 - (Date.now() - (ctx.resetAt ?? 0));
  if (wait > 0) await sleep(wait);
  if (ctx.listItem) {
    const order = await api("POST", "/orders/offline", { token: seller.token, body: { orders: [{ provider: ctx.dist.providerKey, items: [{ ...ctx.listItem, qty: 1 }] }] } });
    const row = Array.isArray(order.data) ? order.data[0] : null;
    s.check("SELLER registra un pedido por lista → 201", order.status === 201, order);
    s.check("pedido del SELLER (sin orders.confirm) queda pendiente de aprobación", row && row.approvalStatus !== "APPROVED", { approvalStatus: row?.approvalStatus, status: row?.status }, {
      hint: "orders.service.ts:113-159 createOffline graba approvalStatus APPROVED y approvedByUserId = quien lo creó, sin mirar needsApproval()",
    });
  }

  // Desactivar la membresía (no borrar): el token del vendedor tiene que dejar de servir para la org.
  const off = await api("PUT", `/my/team/${seller.membershipId}`, { token: o.token, body: { active: false } });
  s.check("dueño desactiva la membresía → 200", off.status === 200, off);
  const offOrg = await api("GET", "/my/org", { token: seller.token });
  s.check("membresía inactiva → /my/org 403", offOrg.status === 403, offOrg);
  const on = await api("PUT", `/my/team/${seller.membershipId}`, { token: o.token, body: { active: true } });
  s.check("reactivar membresía → 200", on.status === 200, on);

  // Borrar al miembro: el token viejo no tiene que seguir entrando a la org.
  const del = await api("DELETE", `/my/team/${seller.membershipId}`, { token: o.token });
  s.check("dueño quita al SELLER → 200", del.status === 200, del);
  const afterDel = await api("GET", "/my/org", { token: seller.token });
  s.check("token del miembro quitado → no accede a la org (401/403)", [401, 403].includes(afterDel.status), afterDel, {
    hint: "tenant-context.service.ts:164-178 fromSession: si la membresía fue BORRADA (no desactivada) cae al respaldo con los claims del JWT y le devuelve la org con su rol viejo",
  });
  const afterDelOrders = await api("GET", "/orders", { token: seller.token });
  s.check("token del miembro quitado → no lista pedidos de la org", [401, 403].includes(afterDelOrders.status), { status: afterDelOrders.status, count: Array.isArray(afterDelOrders.data) ? afterDelOrders.data.length : null });
  const afterDelCart = await api("PUT", "/cart/org", { token: seller.token, body: { items: [{ hacked: true }] } });
  s.check("token del miembro quitado → no puede escribir el carrito de la org", [401, 403].includes(afterDelCart.status), afterDelCart);
  if (afterDelCart.status === 200) {
    // Se deja el carrito del dueño como estaba antes.
    await api("PUT", "/cart/org", { token: o.token, body: { items: ctx.cartItems ?? [] } });
  }
  const selfRemove = await api("DELETE", `/my/team/${(await ctx.prisma.tenantMembership.findFirst({ where: { userId: o.userId } }))?.id}`, { token: o.token });
  s.check("el dueño no puede quitarse a sí mismo → 400", selfRemove.status === 400, selfRemove);
}

export async function s5Security(ctx) {
  const s = scenario("S5", "Seguridad: bloqueo, tokens, admin, otra org");
  const v = await registerVerified(ctx, "lock");
  const fails = [];
  for (let i = 0; i < 5; i++) fails.push(await api("POST", "/auth/login", { body: { username: v.username, password: `mal-${i}` } }));
  s.check("5 contraseñas mal → 401 cada una", fails.every((f) => f.status === 401), fails[4]);
  const locked = await api("POST", "/auth/login", { body: { username: v.username, password: v.password } });
  s.check("con la contraseña correcta → 401 'Demasiados intentos'", locked.status === 401 && /Demasiados intentos/.test(locked.body?.message ?? ""), locked);
  const ghost = await api("POST", "/auth/login", { body: { username: `${ctx.prefix}-ghost`, password: "x" } });
  s.check("usuario inexistente → 401 genérico (sin enumerar)", ghost.status === 401 && ghost.body?.message === fails[0].body?.message, ghost);

  const tok = ctx.owner.token;
  const [h, p, sig] = tok.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, role: "ROLE_ADMIN" })).toString("base64url")}.${sig}`;
  const t1 = await api("GET", "/admin/users", { token: forged });
  s.check("token con payload alterado (role ADMIN) → 401", t1.status === 401, t1);
  const t2 = await api("GET", "/my/org", { token: `${tok.slice(0, -3)}abc` });
  s.check("token con firma alterada → 401", t2.status === 401, t2);
  const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
  const t3 = await api("GET", "/my/org", { token: none });
  s.check("token alg=none → 401", t3.status === 401, t3);
  const t4 = await api("GET", "/my/org", { token: "basura" });
  s.check("token basura → 401", t4.status === 401, t4);

  for (const [m, path, body] of [
    ["GET", "/admin/users"],
    ["GET", "/admin/tenants"],
    ["GET", "/admin/subscriptions"],
    ["POST", "/admin/onboarding/retailers", { name: "x", ownerUsername: "xxx", ownerEmail: "x@x.com" }],
    ["PUT", `/admin/users/${ctx.owner.userId}/active-status`, { active: false }],
    ["POST", `/admin/users/${ctx.base.userId}/impersonate`],
    ["GET", "/admin/health/overview"],
  ]) {
    const r = await api(m, path, { token: tok, body });
    s.check(`usuario común → ${m} ${path} 403`, r.status === 403, r);
  }

  // Usuario desactivado por el superadmin (con la sesión recién usada).
  const d = await registerVerified(ctx, "deac");
  const warm = await api("GET", "/onboarding/status", { token: d.token });
  const deact = await api("PUT", `/admin/users/${d.userId}/active-status`, { token: ctx.admin.token, body: { active: false } });
  s.check("superadmin desactiva la cuenta → 200", deact.status === 200 && warm.status === 200, deact);
  const dNow = await api("GET", "/onboarding/status", { token: d.token });
  s.check("token del usuario desactivado, inmediato → 401", dNow.status === 401, dNow, {
    hint: "users.service.ts:75-85 no sube sessionVersion y jwt.strategy.ts cachea 'active' 30 s",
  });
  const dRefresh = await api("POST", "/auth/refresh", { token: d.token });
  s.check("usuario desactivado no puede renovar el token", dRefresh.status === 401, dRefresh);
  const dLogin = await api("POST", "/auth/login", { body: { username: d.username, password: d.password } });
  s.check("usuario desactivado no puede loguearse → 401", dLogin.status === 401, dLogin);
  ctx.deferred.push(async () => {
    const later = await api("GET", "/onboarding/status", { token: d.token });
    s.check("token del usuario desactivado, 31 s después → 401", later.status === 401, later);
  });
  ctx.securityScenario = s;
}

/** Acceso cruzado entre organizaciones (se corre con pedidos, carrito y vínculos ya creados). */
export async function s5bCrossOrg(ctx) {
  const s = scenario("S5b", "Seguridad: datos de otra organización por id");
  const intruder = ctx.base.token;
  const ownerOrder = ctx.ownerOrderId;
  const ownerMembership = (await ctx.prisma.tenantMembership.findFirst({ where: { userId: ctx.owner.userId } }))?.id;
  const cartItem = await ctx.prisma.cartItem.findFirst({ where: { tenantId: ctx.owner.tenantId } });
  const probes = [
    ["PATCH", `/orders/${ownerOrder}`, { notes: "hack" }, [403, 404]],
    ["POST", `/orders/${ownerOrder}/approve`, undefined, [403, 404]],
    ["POST", `/orders/${ownerOrder}/reject`, { reason: "hack" }, [403, 404]],
    ["POST", `/orders/${ownerOrder}/approval-quote`, undefined, [403, 404]],
    ["PATCH", `/cart/items/${cartItem?.id ?? "x"}`, { quantity: 99 }, [403, 404]],
    ["DELETE", `/cart/items/${cartItem?.id ?? "x"}`, undefined, [403, 404]],
    ["PUT", `/my/team/${ownerMembership}`, { role: "VIEWER" }, [403, 404]],
    ["DELETE", `/my/team/${ownerMembership}`, undefined, [403, 404]],
    ["POST", `/my/team/${ownerMembership}/password`, undefined, [403, 404]],
    ["GET", `/my/clients/${ctx.ownerLinkId}`, undefined, [403, 404]],
    ["GET", `/cart/clients/${ctx.ownerLinkId}`, undefined, [403, 404]],
    ["GET", `/credentials/INVID`, undefined, [403, 404]],
  ];
  if (ctx.importId) probes.push(["GET", `/providers/${ctx.dist.providerKey}/imports/${ctx.importId}`, undefined, [403, 404]]);
  for (const [m, path, body, ok] of probes) {
    const r = await api(m, path, { token: intruder, body });
    s.check(`otro comercio → ${m} ${path.replace(/[0-9a-f-]{36}/g, ":id")} → ${ok.join("/")}`, ok.includes(r.status), r);
  }
  const still = await ctx.prisma.providerOrder.findUnique({ where: { id: ownerOrder ?? "" } });
  s.check("el pedido del dueño quedó intacto", still && still.notes !== "hack" && still.approvalStatus !== "REJECTED", { notes: still?.notes, approvalStatus: still?.approvalStatus });

  // Otro distribuidor mirando la cartera de SIMDIST.
  if (ctx.otherDist) {
    const r = await api("GET", `/my/clients/${ctx.ownerLinkId}`, { token: ctx.otherDist.token });
    s.check("otro distribuidor → GET /my/clients/:linkId ajeno → 403/404", [403, 404].includes(r.status), r);
    const c = await api("GET", `/cart/clients/${ctx.ownerLinkId}`, { token: ctx.otherDist.token });
    s.check("otro distribuidor → GET /cart/clients/:linkId ajeno → 403/404", [403, 404].includes(c.status), c);
    const codes = await ctx.prisma.tenantAccessCode.findFirst({ where: { tenantId: ctx.dist.tenantId } });
    const rv = await api("DELETE", `/my/access-codes/${codes?.id}`, { token: ctx.otherDist.token });
    s.check("otro distribuidor → revocar código ajeno → 404", rv.status === 404, rv);
  }
  await sleep(0);
}
