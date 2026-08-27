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
  const tenants = (tree.tenants ?? tree).filter((t) =>
    (t.members ?? []).length > 0 && t.name !== "Administración" && !t.mirrorsCommercialFromId
  );

  // Hace falta una organización con dos personas y otra distinta para contrastar.
  const conEquipo = tenants.find((t) => t.members.length >= 2);
  if (!conEquipo) throw new Error("No hay ninguna organización con dos personas para probar");
  const otra = tenants.find((t) => t.id !== conEquipo.id);
  if (!otra) throw new Error("Hace falta una segunda organización para probar el aislamiento");

  console.log(`Organización con equipo: ${conEquipo.name} (${conEquipo.members.length} personas)`);
  console.log(`Organización ajena: ${otra.name}\n`);

  const sesion = async (userId) =>
    (await call("POST", `/admin/users/${userId}/impersonate`, adminToken)).payload.data?.token;

  const [unoToken, otroToken] = await Promise.all([
    sesion(conEquipo.members[0].userId),
    sesion(conEquipo.members[1].userId),
  ]);
  const ajenoToken = await sesion(otra.members[0].userId);

  const secreto = `prueba-${Date.now()}`;
  const guardado = await call("POST", "/credentials", unoToken, {
    providerName: PROVIDER,
    credentials: { marca: secreto },
  });
  check(`${conEquipo.members[0].username} puede guardar una credencial`,
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

    // El superadmin de prueba espeja el Comercio de Pruebas: ve esas credenciales,
    // no las de otra organización (salvo que sea la misma).
    const superadmin = await call("GET", "/credentials/me", adminToken);
    check("El superadmin puede leer las credenciales de su comercio",
      superadmin.status === 200, `HTTP ${superadmin.status}`);
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
