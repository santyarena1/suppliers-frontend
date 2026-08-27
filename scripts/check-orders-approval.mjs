/**
 * Verifica la fase 5 del plan de aislamiento: el carrito y los pedidos son de la
 * organización, y un vendedor no confirma solo.
 *
 * Un vendedor arma el pedido y queda esperando la firma del dueño; el dueño lo ve,
 * lo puede rechazar, y nadie de otra organización se entera de que existe. El envío
 * real al proveedor no se prueba acá: mandaría un pedido de verdad.
 *
 * Las sesiones se obtienen con "entrar como", así que alcanza con la del superadmin.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-orders-approval.mjs
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

/** Un pedido mínimo válido para cada proveedor que tiene checkout implementado. */
function pedidoDe(provider, items) {
  switch (provider) {
    case "ELIT":
      return { ruta: "/providers/ELIT/checkout/draft", body: { items, warehouse: 1 } };
    case "NEW_BYTES":
      return { ruta: "/providers/NEW_BYTES/checkout/draft", body: { items, delivery: "pickup", medioDePagoId: 5 } };
    case "GRUPO_NUCLEO":
      return { ruta: "/providers/GRUPO_NUCLEO/checkout/draft", body: { items } };
    case "AIR":
      return { ruta: "/providers/AIR/checkout/draft", body: { items, sucursal: "01", vendedor: "01" } };
    case "INVID":
      return { ruta: "/providers/INVID/checkout/draft", body: { items, paymentOption: "1" } };
    default:
      return null;
  }
}

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");
  console.log(`Verificando ${API_URL}\n`);

  const login = await call("POST", "/auth/login", null, { username: ADMIN_USER, password: ADMIN_PASSWORD });
  const adminToken = login.payload.data?.token;
  if (!adminToken) throw new Error("No se pudo entrar como administrador");

  const arbol = (await call("GET", "/admin/tenants", adminToken)).payload.data;
  const tenants = arbol.tenants ?? arbol;
  const comercios = tenants.filter((t) =>
    t.type === "RETAILER" && (t.members ?? []).length > 0 && t.name !== "Administración" && !t.mirrorsCommercialFromId
  );

  const conVendedor = comercios.find(
    (t) => t.members.some((m) => m.tenantRole === "SELLER") &&
      t.members.some((m) => m.tenantRole === "OWNER" || m.tenantRole === "ADMIN")
  );
  if (!conVendedor) throw new Error("Hace falta un comercio con un vendedor y un dueño");
  const ajeno = comercios.find((t) => t.id !== conVendedor.id);
  if (!ajeno) throw new Error("Hace falta un segundo comercio para probar el aislamiento");

  const vendedor = conVendedor.members.find((m) => m.tenantRole === "SELLER");
  const dueño = conVendedor.members.find((m) => m.tenantRole === "OWNER" || m.tenantRole === "ADMIN");

  console.log(`Comercio: ${conVendedor.name} (vendedor ${vendedor.username}, dueño ${dueño.username})`);
  console.log(`Comercio ajeno: ${ajeno.name}\n`);

  const sesion = async (userId) =>
    (await call("POST", `/admin/users/${userId}/impersonate`, adminToken)).payload.data?.token;

  const tokenVendedor = await sesion(vendedor.userId);
  const tokenDueño = await sesion(dueño.userId);
  const tokenAjeno = await sesion(ajeno.members[0].userId);

  const proveedores = (await call("GET", "/my/providers", tokenVendedor)).payload.data ?? [];
  const vinculado = proveedores.find((p) => p.linked && pedidoDe(p.provider, []));
  if (!vinculado) throw new Error(`${conVendedor.name} no tiene ningún proveedor con checkout vinculado`);

  const items = [{ code: "1", qty: 1, name: "Producto de prueba" }];
  const { ruta, body } = pedidoDe(vinculado.provider, items);

  // ---------- El vendedor arma pero no confirma ----------

  const armado = await call("POST", ruta, tokenVendedor, body);
  check("Un vendedor arma el pedido y queda esperando aprobación",
    armado.payload.data?.approvalStatus === "PENDING_APPROVAL",
    armado.payload.data?.status ?? armado.payload.message ?? `HTTP ${armado.status}`);

  const pedidoId = armado.payload.data?.id;
  if (!pedidoId) throw new Error("El pedido no se guardó, no se puede seguir");

  const noVinculado = proveedores.find((p) => !p.linked && pedidoDe(p.provider, []));
  if (noVinculado) {
    const otro = pedidoDe(noVinculado.provider, items);
    const intento = await call("POST", otro.ruta, tokenVendedor, otro.body);
    check(`Tampoco puede armar uno de ${noVinculado.name}, que no está vinculado`,
      intento.status === 403 || intento.status === 404, `HTTP ${intento.status}`);
  }

  // ---------- Quién lo ve y quién lo firma ----------

  const suyos = (await call("GET", "/orders", tokenVendedor)).payload.data ?? [];
  check("El vendedor ve su pedido en los de la organización",
    suyos.some((o) => o.id === pedidoId), `${suyos.length} pedidos`);

  const propioVendedor = (await call("GET", "/orders/pending-approval", tokenVendedor)).payload.data;
  check("El vendedor sabe que lo suyo necesita firma y que él no firma",
    propioVendedor?.needsApproval === true && propioVendedor?.canApprove === false,
    `necesita firma: ${propioVendedor?.needsApproval}, puede firmar: ${propioVendedor?.canApprove}`);

  const propioDueño = (await call("GET", "/orders/pending-approval", tokenDueño)).payload.data;
  check("El dueño puede firmar y lo suyo no necesita firma",
    propioDueño?.canApprove === true && propioDueño?.needsApproval === false,
    `puede firmar: ${propioDueño?.canApprove}, necesita firma: ${propioDueño?.needsApproval}`);

  check("El pedido le aparece al dueño para aprobar",
    (propioDueño?.orders ?? []).some((o) => o.id === pedidoId),
    `${(propioDueño?.orders ?? []).length} esperando`);

  const conNombre = (propioDueño?.orders ?? []).find((o) => o.id === pedidoId);
  check("El pedido dice quién lo armó y con qué nombre de proveedor",
    conNombre?.createdBy === vendedor.username && !/^[A-Z_]+$/.test(conNombre?.providerName ?? ""),
    `${conNombre?.createdBy} · ${conNombre?.providerName}`);

  const delAjeno = (await call("GET", "/orders", tokenAjeno)).payload.data ?? [];
  check(`${ajeno.name} no ve el pedido de ${conVendedor.name}`,
    !delAjeno.some((o) => o.id === pedidoId), `${delAjeno.length} pedidos propios`);

  const ajenoAprueba = await call("POST", `/orders/${pedidoId}/approve`, tokenAjeno);
  check("Alguien de otra organización no lo puede aprobar",
    ajenoAprueba.status === 403 || ajenoAprueba.status === 404, `HTTP ${ajenoAprueba.status}`);

  const vendedorAprueba = await call("POST", `/orders/${pedidoId}/approve`, tokenVendedor);
  check("El vendedor no puede aprobar su propio pedido", vendedorAprueba.status === 403,
    vendedorAprueba.payload.message ?? `HTTP ${vendedorAprueba.status}`);

  // ---------- El dueño decide ----------

  const rechazo = await call("POST", `/orders/${pedidoId}/reject`, tokenDueño, {
    reason: "Prueba automática",
  });
  check("El dueño lo rechaza", rechazo.payload.data?.approvalStatus === "REJECTED",
    rechazo.payload.data?.rejectionReason ?? `HTTP ${rechazo.status}`);

  const reintento = await call("POST", `/orders/${pedidoId}/approve`, tokenDueño);
  check("Un pedido ya resuelto no se puede aprobar después", reintento.status === 400,
    reintento.payload.message ?? `HTTP ${reintento.status}`);

  const pendientesFinal = (await call("GET", "/orders/pending-approval", tokenDueño)).payload.data;
  check("Deja de estar esperando",
    !(pendientesFinal?.orders ?? []).some((o) => o.id === pedidoId),
    `${(pendientesFinal?.orders ?? []).length} esperando`);

  // ---------- El carrito también es de la organización ----------

  const item = { provider: vinculado.provider, externalId: "prueba-1", name: "Prueba", price: "10", imageUrl: "", quantity: 1 };
  const agregado = await call("POST", "/cart/items", tokenVendedor, item);
  check("Se puede agregar al carrito", agregado.status === 201 || agregado.status === 200,
    `HTTP ${agregado.status}`);

  const carritoAjeno = (await call("GET", "/cart", tokenAjeno)).payload.data ?? [];
  check("El carrito de uno no aparece en el de otra organización",
    !carritoAjeno.some((i) => i.externalId === "prueba-1"), `${carritoAjeno.length} ítems`);

  await call("DELETE", "/cart", tokenVendedor);

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} verificaciones pasaron`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("Falló la verificación:", err.message);
  process.exit(1);
});
