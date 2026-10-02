// T1: códigos de invitación al equipo de un comercio.
import { api, scenario } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";

export async function t1TeamInvite(ctx) {
  const s = scenario("T1", "Código de invitación al equipo");

  // Dueño con su comercio.
  const owner = await registerVerified(ctx, "tinv-own");
  const boot = await api("POST", "/onboarding/bootstrap", { token: owner.token, body: { name: `Comercio ${ctx.prefix} Equipo` } });
  s.check("el dueño crea su comercio → 201", boot.status === 201 && boot.data?.token, boot);
  const ownerToken = boot.data?.token;

  const bad = await api("POST", "/my/team/invite-codes", { token: ownerToken, body: { role: "OWNER" } });
  s.check("código con rol dueño → 400", bad.status === 400, bad);

  const created = await api("POST", "/my/team/invite-codes", { token: ownerToken, body: { role: "SELLER", maxUses: 1 } });
  const code = created.data?.code;
  s.check("el dueño crea un código SELLER de 1 uso → 201", created.status === 201 && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code ?? ""), created);

  const list = await api("GET", "/my/team/invite-codes", { token: ownerToken });
  s.check("el código figura en la lista del equipo", list.status === 200 && (list.data ?? []).some((c) => c.code === code), list);

  const pv = await api("GET", `/team-invites/${code}/preview`);
  s.check("preview público: comercio y rol", pv.status === 200 && pv.data?.valid === true && pv.data?.roleLabel === "Vendedor" && Boolean(pv.data?.organizationName), pv);
  const pvBad = await api("GET", "/team-invites/ZZZZ-ZZZZ/preview");
  s.check("preview de un código inexistente → {valid:false} sin más datos", pvBad.status === 200 && JSON.stringify(pvBad.data) === JSON.stringify({ valid: false }), pvBad);

  // Usuario nuevo: se registra, verifica y canjea.
  const newbie = await registerVerified(ctx, "tinv-new");
  const join = await api("POST", "/onboarding/join-team", { token: newbie.token, body: { code: code.toLowerCase() } });
  s.check("canjear el código (en minúsculas) → entra al equipo", (join.status === 200 || join.status === 201) && join.data?.role === "SELLER" && join.data?.token, join);
  const org = await api("GET", "/my/org", { token: join.data?.token });
  s.check("con el token nuevo ve el comercio del dueño", org.status === 200 && org.data?.name === `Comercio ${ctx.prefix} Equipo`, { status: org.status, name: org.data?.name });
  const team = await api("GET", "/my/team", { token: ownerToken });
  const member = (team.data?.members ?? []).find((m) => m.username === newbie.username);
  s.check("el dueño lo ve en el equipo como Vendedor", member?.tenantRole === "SELLER" || member?.role === "SELLER", { member });

  const again = await api("POST", "/onboarding/join-team", { token: join.data?.token, body: { code } });
  s.check("el mismo usuario no puede canjear de nuevo (409/400)", again.status === 409 || again.status === 400, again);

  // Segundo usuario con el código ya usado.
  const late = await registerVerified(ctx, "tinv-late");
  const used = await api("POST", "/onboarding/join-team", { token: late.token, body: { code } });
  s.check("código de 1 uso ya usado → 400 TEAM_INVITE_INVALID", used.status === 400 && used.body?.code === "TEAM_INVITE_INVALID", used);
  const pvUsed = await api("GET", `/team-invites/${code}/preview`);
  s.check("preview del código agotado → valid:false", pvUsed.data?.valid === false, pvUsed);

  // Revocado.
  const c2 = await api("POST", "/my/team/invite-codes", { token: ownerToken, body: { role: "VIEWER" } });
  const rev = await api("DELETE", `/my/team/invite-codes/${c2.data?.id}`, { token: ownerToken });
  s.check("revocar un código → 200", rev.status === 200, rev);
  const usedRev = await api("POST", "/onboarding/join-team", { token: late.token, body: { code: c2.data?.code } });
  s.check("código revocado no sirve → 400", usedRev.status === 400, usedRev);

  // Sin permiso de equipo: el vendedor no maneja códigos.
  const sellerTry = await api("POST", "/my/team/invite-codes", { token: join.data?.token, body: { role: "VIEWER" } });
  s.check("un vendedor no puede crear códigos → 403", sellerTry.status === 403, sellerTry);
}
