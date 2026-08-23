/**
 * Muestra qué usuarios todavía no pertenecen a ninguna organización.
 *
 * Sirve para dimensionar el backfill de la fase 1 del plan de aislamiento antes de
 * correr la migración, y para confirmar después que no quedó nadie afuera.
 *
 * Uso: API_URL=... ADMIN_PASSWORD=... node scripts/check-tenant-coverage.mjs
 */

const API_URL = process.env.API_URL ?? "https://api-staging-8316.up.railway.app";
const ADMIN_USER = process.env.ADMIN_USER ?? "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!ADMIN_PASSWORD) throw new Error("Falta ADMIN_PASSWORD");

  const login = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
  });
  const token = (await login.json()).data?.token;
  if (!token) throw new Error("No se pudo entrar como administrador");

  const get = async (path) =>
    (await (await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` } })).json()).data;

  const users = await get("/admin/users");
  const tree = await get("/admin/tenants");
  const tenants = tree.tenants ?? tree;

  const byUser = new Map();
  for (const tenant of tenants) {
    for (const member of tenant.members ?? []) {
      byUser.set(member.userId, [...(byUser.get(member.userId) ?? []), `${tenant.name} (${tenant.type})`]);
    }
  }

  const orphans = users.filter((u) => !byUser.has(u.id));
  const multi = [...byUser.entries()].filter(([, orgs]) => orgs.length > 1);

  console.log(`${API_URL}\n`);
  console.log(`Usuarios: ${users.length} · Organizaciones: ${tenants.length}`);
  console.log(`Con organización: ${byUser.size} · Sin organización: ${orphans.length}\n`);

  if (orphans.length) {
    console.log("Sin organización:");
    for (const u of orphans) {
      console.log(`  ${u.username.padEnd(24)} ${u.role.padEnd(12)} ${u.brand?.name ?? ""}`);
    }
    console.log();
  }

  if (multi.length) {
    console.log("En más de una organización (rompe la regla de una persona, una organización):");
    for (const [userId, orgs] of multi) {
      const user = users.find((u) => u.id === userId);
      console.log(`  ${user?.username ?? userId}: ${orgs.join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error("Falló:", err.message);
  process.exit(1);
});
