/**
 * Verifica la fase 4 del plan de aislamiento: el descubrimiento es cerrado.
 *
 * Un comercio conoce a los distribuidores con los que tiene vínculo y a nadie más. Un
 * proveedor no vinculado no aparece ni siquiera como existente, y la única forma de
 * conectarse con uno nuevo es canjear un código que no dice de quién es hasta que se
 * canjea.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-closed-discovery.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function call(method, path, token, body) {
  const sinCuerpo = method === "GET" || method === "DELETE";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(sinCuerpo ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(sinCuerpo ? {} : { body: JSON.stringify(body ?? {}) }),
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
  const tenants = tree.tenants ?? tree;
  const comercios = tenants.filter((t) => t.type === "RETAILER" && (t.members ?? []).length > 0);
  const distribuidores = tenants.filter((t) => t.type === "DISTRIBUTOR" && t.providerKey);

  if (comercios.length < 2) throw new Error("Hacen falta dos comercios con personas para probar");
  check("Cada proveedor es también una organización", distribuidores.length >= 14,
    `${distribuidores.length} distribuidores con clave de proveedor`);

  const sesion = async (userId) =>
    (await call("POST", `/admin/users/${userId}/impersonate`, adminToken)).payload.data?.token;

  const conCatalogo = comercios.find((t) => (t.suppliers ?? []).length > 0) ?? comercios[0];
  const sinNada = comercios.find((t) => t.id !== conCatalogo.id);

  const tokenCon = await sesion(conCatalogo.members[0].userId);
  const tokenSin = await sesion(sinNada.members[0].userId);

  const mios = (await call("GET", "/my/providers", tokenCon)).payload.data ?? [];
  const suyos = (await call("GET", "/my/providers", tokenSin)).payload.data ?? [];
  console.log(`\n${conCatalogo.name}: ${mios.map((p) => p.name).join(", ") || "ninguno"}`);
  console.log(`${sinNada.name}: ${suyos.map((p) => p.name).join(", ") || "ninguno"}\n`);

  check("Un comercio ve solo sus proveedores", mios.length < distribuidores.length,
    `${mios.length} de ${distribuidores.length}`);
  check("Los nombres son normalizados, no claves internas",
    mios.every((p) => !/^[A-Z_]+$/.test(p.name)), mios.map((p) => p.name).join(", ") || "sin datos");

  // El proveedor que el primero tiene y el segundo no: para el segundo no existe.
  const ajeno = mios.find((p) => p.linked && !suyos.some((s) => s.provider === p.provider));
  if (ajeno) {
    const estado = await call("GET", `/providers/${ajeno.provider}/status`, tokenSin);
    check(`${sinNada.name} no puede ni consultar ${ajeno.name}`, estado.status === 404,
      `HTTP ${estado.status}`);

    const busqueda = await call("GET", `/search/provider/${ajeno.provider}?name=a`, tokenSin);
    const resultados = busqueda.payload.data ?? busqueda.payload;
    check("Tampoco le aparece nada al buscarlo",
      busqueda.status === 200 && Array.isArray(resultados) && resultados.length === 0,
      `HTTP ${busqueda.status}, ${Array.isArray(resultados) ? resultados.length : "?"} resultados`);

    const credencial = await call("POST", "/credentials", tokenSin, {
      providerName: ajeno.provider,
      credentials: { marca: "prueba" },
    });
    check("Ni cargarle una cuenta", credencial.status === 404, `HTTP ${credencial.status}`);
  } else {
    console.log("(Los dos comercios ven lo mismo, se omiten las pruebas de aislamiento entre comercios)");
  }

  // Un código inexistente no puede distinguirse de uno revocado ni de uno ajeno.
  const inventado = await call("POST", "/my/redeem-code", tokenSin, { code: "ZZZZ-ZZZZ-ZZZZ" });
  check("Un código inventado no revela nada", inventado.status === 400,
    inventado.payload.message ?? `HTTP ${inventado.status}`);

  // Un código real conecta y recién ahí dice de quién era.
  const emisor = distribuidores.find((t) => !suyos.some((s) => s.provider === t.providerKey));
  if (emisor) {
    const creado = await call("POST", `/admin/tenants/${emisor.id}/access-codes`, adminToken, {
      label: "prueba de canje",
      maxUses: 1,
    });
    const code = creado.payload.data?.code;
    check("El distribuidor puede emitir un código", Boolean(code), code ?? `HTTP ${creado.status}`);

    if (code) {
      const canje = await call("POST", "/my/redeem-code", tokenSin, { code });
      check("Canjearlo conecta con quien lo emitió",
        canje.status === 201 && canje.payload.data?.tenantName === emisor.name,
        canje.payload.data?.tenantName ?? `HTTP ${canje.status}`);

      const repetido = await call("POST", "/my/redeem-code", tokenSin, { code });
      check("Un código de un solo uso no se puede reusar", repetido.status === 400,
        `HTTP ${repetido.status}`);

      const ahora = (await call("GET", "/my/providers", tokenSin)).payload.data ?? [];
      check(`Ahora ${emisor.name} aparece entre sus proveedores`,
        ahora.some((p) => p.provider === emisor.providerKey && p.linked),
        ahora.map((p) => p.name).join(", "));

      // Se deshace para que el script se pueda volver a correr igual.
      const arbol = (await call("GET", "/admin/tenants", adminToken)).payload.data;
      const actualizado = (arbol.tenants ?? arbol).find((t) => t.id === sinNada.id);
      const nuevo = (actualizado?.suppliers ?? []).find((l) => l.tenant?.id === emisor.id);
      if (nuevo) await call("DELETE", `/admin/tenants/links/${nuevo.id}`, adminToken);
    }
  }

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
