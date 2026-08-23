/**
 * Verifica de punta a punta la suplantación contra un entorno desplegado.
 *
 * Comprueba que el token emitido pertenece al usuario elegido, que lleva la
 * marca de quién lo pidió, que sirve para consultar la plataforma como él y que
 * no se puede usar contra otro administrador ni sobre uno mismo.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-impersonation.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TARGET = process.env.TARGET_USERNAME ?? "tecnostore.vendedor";

async function call(method, path, { token, body } = {}) {
  // Fastify rechaza un content-type JSON sin cuerpo, así que todo POST manda al
  // menos un objeto vacío, igual que el cliente del navegador.
  const sent = method === "POST" ? (body ?? {}) : body;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(sent ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(sent ? { body: JSON.stringify(sent) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, payload };
}

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando ${API_URL}\n`);

  const login = await call("POST", "/auth/login", {
    body: { username: ADMIN_USER, password: ADMIN_PASSWORD },
  });
  if (login.status !== 200) throw new Error(`No se pudo entrar como ${ADMIN_USER}: ${login.payload.message}`);
  const adminToken = login.payload.data.token;
  const adminId = decodeJwt(adminToken).userId;

  const users = (await call("GET", "/admin/users", { token: adminToken })).payload.data;
  const target = users.find((u) => u.username === TARGET);
  if (!target) throw new Error(`No existe el usuario ${TARGET}`);

  const impersonation = await call("POST", `/admin/users/${target.id}/impersonate`, { token: adminToken });
  check("El superadmin puede pedir una sesión de otro usuario", impersonation.status === 201 || impersonation.status === 200,
    `HTTP ${impersonation.status}`);
  if (!impersonation.payload.data) throw new Error(JSON.stringify(impersonation.payload));

  const token = impersonation.payload.data.token;
  const claims = decodeJwt(token);
  check("El token pertenece al usuario elegido", claims.userId === target.id, `sub=${claims.sub}`);
  check("El token registra quién lo pidió", claims.impersonatedBy === adminId, `impersonatedBy=${claims.impersonatedByUsername}`);
  check("La sesión dura una hora", claims.exp - claims.iat === 3600, `${claims.exp - claims.iat}s`);

  const permissions = await call("GET", "/me/permissions", { token });
  check("La sesión suplantada sirve para consultar la plataforma", permissions.status === 200,
    `módulos: ${(permissions.payload.data ?? []).join(", ") || "ninguno"}`);

  const asAdmin = await call("GET", "/admin/users", { token });
  check("La sesión suplantada no hereda permisos de administrador", asAdmin.status === 403, `HTTP ${asAdmin.status}`);

  // Para probar el bloqueo entre administradores hace falta un segundo admin.
  // Se crea al vuelo sin contraseña —lo que de paso verifica que la plataforma
  // la genere y la devuelva— y se borra al terminar.
  const scratch = await call("POST", "/admin/users", {
    token: adminToken,
    body: {
      username: `verificacion-admin-${Date.now()}`,
      email: `verificacion-${Date.now()}@nodo.test`,
      role: "ROLE_ADMIN",
    },
  });
  const created = scratch.payload.data;
  check("Crear sin contraseña devuelve una generada", Boolean(created?.generatedPassword),
    created?.generatedPassword ? `${created.generatedPassword.length} caracteres` : "no vino ninguna");

  if (created?.id) {
    const blocked = await call("POST", `/admin/users/${created.id}/impersonate`, { token: adminToken });
    check("No se puede entrar como otro administrador", blocked.status === 400, blocked.payload.message ?? "");
    await call("DELETE", `/admin/users/${created.id}`, { token: adminToken });
  }

  const self = await call("POST", `/admin/users/${adminId}/impersonate`, { token: adminToken });
  check("No se puede entrar como uno mismo", self.status === 400, self.payload.message ?? "");

  const nested = await call("POST", `/admin/users/${target.id}/impersonate`, { token });
  check("Una sesión suplantada no puede encadenar otra", nested.status === 403 || nested.status === 400,
    `HTTP ${nested.status}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} verificaciones pasaron`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
