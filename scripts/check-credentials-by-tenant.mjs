/**
 * Verifica la fase 2 del plan de aislamiento: las credenciales son de la
 * organización, no de la persona.
 *
 * Guarda una credencial de prueba como una persona y comprueba que la vea un
 * compañero de la misma organización, que no la vea nadie de otra, y que la
 * configuración de sincronización siga la misma regla. Al final la borra.
 *
 * Las sesiones se obtienen con "entrar como", así que no hace falta saber ninguna
 * contraseña más que la del superadmin.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-credentials-by-tenant.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Un proveedor de catálogo público: guardar una credencial falsa no dispara nada.
const PROVIDER = process.env.PROVIDER ?? "CEVEN";

async function call(method, path, token, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(method === "GET" || method === "DELETE" ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  return { status: res.status, payload: await res.json().catch(() => ({})) };
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push(ok);
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando ${API_URL}\n`);

  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const tree = (await call("GET", "/admin/tenants", adminToken)).payload.data;
  const impersonable = (m) => m.platformRole !== "ROLE_ADMIN";
  const tenants = (tree.tenants ?? tree).filter((t) => (t.members ?? []).some(impersonable));

  // Hace falta una organización con dos personas (que no sean el superadmin) y otra distinta para contrastar.
  const conEquipo = tenants.find((t) => t.members.filter(impersonable).length >= 2);
  if (!conEquipo) throw new Error("No hay ninguna organización con dos personas para probar");
  const otra = tenants.find((t) => t.id !== conEquipo.id && t.members.some(impersonable));
  if (!otra) throw new Error("Hace falta una segunda organización para probar el aislamiento");

  console.log(`Organización con equipo: ${conEquipo.name} (${conEquipo.members.filter(impersonable).length} personas)`);
  console.log(`Organización ajena: ${otra.name}\n`);

  const sesion = async (userId) =>
    (await call("POST", `/admin/users/${userId}/impersonate`, adminToken)).payload.data?.token;

  const equipo = conEquipo.members.filter(impersonable);
  const [unoToken, otroToken] = await Promise.all([
    sesion(equipo[0].userId),
    sesion(equipo[1].userId),
  ]);
  const ajenoToken = await sesion(otra.members.find(impersonable).userId);

  const secreto = `prueba-${Date.now()}`;
  const guardado = await call("POST", "/credentials", unoToken, {
    providerName: PROVIDER,
    credentials: { marca: secreto },
  });
  check(`${equipo[0].username} puede guardar una credencial`,
    guardado.status === 200 || guardado.status === 201, `HTTP ${guardado.status}`);

  try {
    const delCompanero = await call("GET", `/credentials/${PROVIDER}`, otroToken);
    check(`Un compañero de ${conEquipo.name} ve la misma credencial`,
      delCompanero.status === 200 && delCompanero.payload.data?.credentialsJson?.includes(secreto),
      `HTTP ${delCompanero.status}`);

    const delAjeno = await call("GET", `/credentials/${PROVIDER}`, ajenoToken);
    check(`Alguien de ${otra.name} no la ve`, delAjeno.status === 404, `HTTP ${delAjeno.status}`);

    const listaAjena = await call("GET", "/credentials/me", ajenoToken);
    const filtra = Array.isArray(listaAjena.payload.data)
      && !JSON.stringify(listaAjena.payload.data).includes(secreto);
    check("Tampoco aparece en su listado de credenciales", filtra, `HTTP ${listaAjena.status}`);

    // La configuración de sincronización sigue la misma regla que la credencial.
    const markup = 7.5;
    const escribe = await call("PUT", `/providers/${PROVIDER}/config`, unoToken, { priceMarkupPercent: markup });
    check("Se puede guardar la configuración de sincronización", escribe.status === 200, `HTTP ${escribe.status}`);

    const leeCompanero = await call("GET", `/providers/${PROVIDER}/config`, otroToken);
    check("Un compañero ve el mismo markup",
      Number(leeCompanero.payload.data?.priceMarkupPercent) === markup,
      `${leeCompanero.payload.data?.priceMarkupPercent}%`);

    const leeAjeno = await call("GET", `/providers/${PROVIDER}/config`, ajenoToken);
    check("Otra organización conserva el suyo",
      Number(leeAjeno.payload.data?.priceMarkupPercent) !== markup,
      `${leeAjeno.payload.data?.priceMarkupPercent}%`);

    const estadoCompanero = await call("GET", `/providers/${PROVIDER}/status`, otroToken);
    check("El estado del proveedor dice que la organización tiene cuenta",
      estadoCompanero.payload.data?.hasCredentials === true,
      `hasCredentials=${estadoCompanero.payload.data?.hasCredentials}`);

    // El superadmin de prueba opera el Comercio de Pruebas: ve las credenciales
    // de ese comercio, no las de la organización que se usó para esta prueba
    // (salvo que sea la misma).
    const superadmin = await call("GET", "/credentials/me", adminToken);
    check("El superadmin puede leer las credenciales de su comercio",
      superadmin.status === 200, `HTTP ${superadmin.status}`);
    const demo = tenants.find((t) => t.name === "Comercio de Pruebas");
    if (demo && conEquipo.id === demo.id) {
      check("En el comercio de pruebas ve la misma credencial que testuser1",
        JSON.stringify(superadmin.payload.data ?? []).includes(secreto),
        "aparece en /credentials/me");
    } else {
      check("La credencial de otra organización no le aparece al superadmin",
        !JSON.stringify(superadmin.payload.data ?? []).includes(secreto),
        `HTTP ${superadmin.status}`);
    }
  } finally {
    await call("DELETE", `/credentials/${PROVIDER}`, unoToken);
    await call("PUT", `/providers/${PROVIDER}/config`, unoToken, { priceMarkupPercent: 0 });
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
