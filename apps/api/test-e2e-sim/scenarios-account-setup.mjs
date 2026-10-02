// S11: el superadmin regenera la contraseña y la persona completa su cuenta.
import { api, codeFromLog, logLength, scenario } from "./lib.mjs";
import { registerVerified } from "./scenarios-auth.mjs";

export async function s11AccountSetup(ctx) {
  const s = scenario("S11", "Contraseña regenerada → completar la cuenta");
  const u = await registerVerified(ctx, "setup");

  const reset = await api("PUT", `/admin/users/${u.userId}/password`, { token: ctx.admin.token, body: {} });
  const temp = reset.data?.generatedPassword;
  s.check("el superadmin regenera la contraseña → 200 con la temporal", reset.status === 200 && typeof temp === "string", reset);

  const oldSession = await api("GET", "/my/org", { token: u.token });
  s.check("la sesión anterior queda cerrada → 401", oldSession.status === 401, oldSession);

  const login = await api("POST", "/auth/login", { body: { username: u.username, password: temp } });
  s.check("login con la temporal → 200 y avisa que falta completar", login.status === 200 && login.data?.mustSetupAccount === true, login);
  const token = login.data?.token;

  const blocked = await api("GET", "/onboarding/status", { token });
  s.check("cualquier otro endpoint → 403 ACCOUNT_SETUP_REQUIRED", blocked.status === 403 && blocked.body?.code === "ACCOUNT_SETUP_REQUIRED", blocked);

  const status = await api("GET", "/auth/account-setup", { token });
  s.check("GET /auth/account-setup → 200 pendiente", status.status === 200 && status.data?.mustSetupAccount === true, status);

  const early = await api("POST", "/auth/account-setup/password", { token, body: { password: "Nueva-Pass-123" } });
  s.check("contraseña sin confirmar el mail → 400", early.status === 400, early);

  const taken = await api("POST", "/auth/account-setup/email", { token, body: { email: ctx.adminEmail ?? `${ctx.prefix}-adm@sim.nodo.test` } });
  s.check("mail que usa otra cuenta → 409", taken.status === 409, taken);

  const newEmail = `${ctx.prefix}-setup-nuevo@sim.nodo.test`;
  const before = logLength();
  const send = await api("POST", "/auth/account-setup/email", { token, body: { email: newEmail } });
  s.check("manda el código al mail nuevo → 200", send.status === 200 && send.data?.sent === true, send);
  const found = await codeFromLog(newEmail, { after: before });
  s.check("el código sale por el log", Boolean(found), { found: Boolean(found) });

  const wrong = await api("POST", "/auth/account-setup/email/verify", { token, body: { email: newEmail, code: "000000" } });
  s.check("código incorrecto → 400", wrong.status === 400, wrong);
  const verify = await api("POST", "/auth/account-setup/email/verify", { token, body: { email: newEmail, code: found?.code ?? "" } });
  s.check("código correcto → mail confirmado", verify.status === 200 && verify.data?.verified === true, verify);

  const done = await api("POST", "/auth/account-setup/password", { token, body: { password: "Nueva-Pass-123" } });
  s.check("contraseña nueva → 200 con token nuevo", done.status === 200 && typeof done.data?.token === "string", done);

  const normal = await api("GET", "/onboarding/status", { token: done.data?.token });
  s.check("con el token nuevo entra normal", normal.status === 200, normal);

  const tempAgain = await api("POST", "/auth/login", { body: { username: u.username, password: temp } });
  s.check("la temporal ya no sirve → 401", tempAgain.status === 401, tempAgain);
  const fresh = await api("POST", "/auth/login", { body: { username: newEmail, password: "Nueva-Pass-123" } });
  s.check("entra con el mail nuevo y la contraseña nueva, sin pendientes", fresh.status === 200 && !fresh.data?.mustSetupAccount, fresh);

  const again = await api("POST", "/auth/account-setup/email", { token: fresh.data?.token, body: { email: "otro@sim.nodo.test" } });
  s.check("con la cuenta completa, los pasos ya no aplican → 400", again.status === 400, again);
}
