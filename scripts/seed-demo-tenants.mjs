/**
 * Crea el juego de organizaciones y usuarios de ejemplo del modelo multi-tenant
 * (ver docs/ARQUITECTURA_TENANTS.md): dos comercios, dos distribuidores y dos
 * marcas, cada uno con sus sub-usuarios y sus vínculos comerciales cruzados.
 *
 * Es idempotente: si una organización o un usuario ya existe, lo reutiliza.
 *
 * Uso:
 *   node scripts/seed-demo-tenants.mjs
 *   API_URL=... ADMIN_USER=... ADMIN_PASSWORD=... node scripts/seed-demo-tenants.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-production-f4aa.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "password123";

let token = "";

async function call(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success === false) {
    const error = new Error(payload.message ?? `${method} ${path} → ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return payload.data;
}

/** Las organizaciones del catálogo con las que arranca el sistema. */
const ORGANIZATIONS = [
  {
    name: "Tecno Store Palermo",
    type: "RETAILER",
    contactEmail: "compras@tecnostorepalermo.test",
    members: [
      { username: "tecnostore.admin", role: "OWNER", title: "Dueño del local" },
      { username: "tecnostore.vendedor", role: "SELLER", title: "Vendedor de salón" },
    ],
  },
  {
    name: "Compumundo Rosario",
    type: "RETAILER",
    contactEmail: "compras@compumundorosario.test",
    members: [
      { username: "compumundo.admin", role: "OWNER", title: "Encargado de compras" },
      { username: "compumundo.comprador", role: "BUYER", title: "Comprador" },
    ],
  },
  {
    name: "New Bytes",
    type: "DISTRIBUTOR",
    providerKey: "NEW_BYTES",
    contactEmail: "ventas@newbytes.test",
    members: [
      { username: "newbytes.gerente", role: "OWNER", title: "Gerente comercial" },
      { username: "newbytes.vendedor", role: "SELLER", title: "Vendedor de cuenta" },
      {
        username: "newbytes.pm",
        role: "PRODUCT_MANAGER",
        title: "Product Manager",
        managedBrands: ["Asus", "Gigabyte"],
      },
    ],
  },
  {
    name: "Elit",
    type: "DISTRIBUTOR",
    providerKey: "ELIT",
    contactEmail: "ventas@elit.test",
    members: [
      { username: "elit.gerente", role: "OWNER", title: "Gerente comercial" },
      { username: "elit.vendedor", role: "SELLER", title: "Vendedor de cuenta" },
    ],
  },
  {
    name: "Asus",
    type: "BRAND",
    contactEmail: "trade@asus.test",
    members: [
      { username: "asus.admin", role: "OWNER", title: "Country manager" },
      { username: "asus.marketing", role: "MARKETING", title: "Marketing" },
    ],
  },
  {
    name: "Gigabyte",
    type: "BRAND",
    contactEmail: "trade@gigabyte.test",
    members: [
      { username: "gigabyte.admin", role: "OWNER", title: "Country manager" },
      { username: "gigabyte.comercial", role: "COMMERCIAL", title: "Comercial" },
    ],
  },
];

/** Cada comercio ve solo estas organizaciones. */
const LINKS = [
  { client: "Tecno Store Palermo", supplier: "New Bytes", seller: "newbytes.vendedor", discountPercent: 4 },
  { client: "Tecno Store Palermo", supplier: "Asus", discountPercent: 2 },
  { client: "Compumundo Rosario", supplier: "Elit", seller: "elit.vendedor", discountPercent: 3 },
  { client: "Compumundo Rosario", supplier: "Gigabyte" },
];

async function main() {
  console.log(`Autenticando como ${ADMIN_USER} en ${API_URL}`);
  ({ token } = await call("POST", "/auth/login", { username: ADMIN_USER, password: ADMIN_PASSWORD }));

  let tree = await call("GET", "/admin/tenants");
  const byName = new Map(tree.tenants.map((tenant) => [tenant.name, tenant]));

  for (const org of ORGANIZATIONS) {
    let tenant = byName.get(org.name);
    if (tenant) {
      console.log(`= ${org.name} ya existía`);
    } else {
      tenant = await call("POST", "/admin/tenants", {
        name: org.name,
        type: org.type,
        providerKey: org.providerKey,
        contactEmail: org.contactEmail,
      });
      byName.set(org.name, tenant);
      console.log(`+ ${org.name} (${org.type})`);
    }

    for (const member of org.members) {
      const existing = (tenant.members ?? []).find((candidate) => candidate.username === member.username);
      if (existing) {
        console.log(`  = ${member.username}`);
        continue;
      }
      try {
        await call("POST", `/admin/tenants/${tenant.id}/members/new-user`, {
          username: member.username,
          email: `${member.username}@nodo.test`,
          password: DEMO_PASSWORD,
          role: member.role,
          title: member.title,
        });
        console.log(`  + ${member.username} (${member.role})`);
      } catch (err) {
        console.log(`  ! ${member.username}: ${err.message}`);
      }
    }
  }

  // Releemos el árbol para tener los ids de las membresías recién creadas.
  tree = await call("GET", "/admin/tenants");
  const tenants = new Map(tree.tenants.map((tenant) => [tenant.name, tenant]));

  for (const org of ORGANIZATIONS) {
    const tenant = tenants.get(org.name);
    if (!tenant) continue;
    for (const member of org.members) {
      if (!member.managedBrands) continue;
      const membership = tenant.members.find((candidate) => candidate.username === member.username);
      if (!membership) continue;
      await call("PUT", `/admin/tenants/members/${membership.membershipId}/managed-brands`, {
        brandNames: member.managedBrands,
      });
      console.log(`  · ${member.username} administra ${member.managedBrands.join(", ")}`);
    }
  }

  for (const link of LINKS) {
    const client = tenants.get(link.client);
    const supplier = tenants.get(link.supplier);
    if (!client || !supplier) continue;
    const seller = link.seller
      ? supplier.members.find((member) => member.username === link.seller)
      : undefined;
    await call("PUT", "/admin/tenants/links", {
      clientTenantId: client.id,
      supplierTenantId: supplier.id,
      accountManagerId: seller?.userId ?? null,
      status: "ACTIVE",
      discountPercent: link.discountPercent ?? null,
    });
    console.log(`↔ ${link.client} ← ${link.supplier}${seller ? ` (vendedor: ${seller.username})` : ""}`);
  }

  console.log("\nListo. Todos los usuarios de ejemplo usan la contraseña:", DEMO_PASSWORD);
}

main().catch((err) => {
  console.error("Falló el seed:", err.message);
  process.exit(1);
});
