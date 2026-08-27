/**
 * Crea (o repone la contraseña de) el usuario superadmin de un entorno vacío.
 *
 * Es el único paso que no puede hacerse por la API: sin un ROLE_ADMIN no hay con
 * qué autenticarse contra `/admin/*`. Una vez creado, el resto de la carga de datos
 * va por HTTP con `scripts/seed-demo-tenants.mjs`.
 *
 * Corre dentro del contenedor de la API, que es quien tiene el cliente de Prisma y
 * el acceso privado a Postgres:
 *
 *   $s = [IO.File]::ReadAllText("scripts/bootstrap-superadmin.cjs")
 *   $s = "process.env.ADMIN_PASSWORD='...';" + $s
 *   $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
 *   railway ssh --environment staging --service api node -e "eval(Buffer.from('$b64','base64').toString('utf8'))"
 *
 * Nunca apuntarlo a producción salvo para una recuperación deliberada de acceso.
 */

const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

const USERNAME = process.env.ADMIN_USERNAME || "superadmin";
const EMAIL = process.env.ADMIN_EMAIL || "superadmin@nodo.test";
const PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!PASSWORD) throw new Error("Falta ADMIN_PASSWORD");

  const prisma = new PrismaClient();
  const passwordHash = await argon2.hash(PASSWORD);

  const user = await prisma.user.upsert({
    where: { username: USERNAME },
    update: { passwordHash, role: "ROLE_ADMIN", active: true },
    create: { username: USERNAME, email: EMAIL, passwordHash, role: "ROLE_ADMIN", active: true },
  });

  // Organización propia (carrito aparte) espejando el comercio de testuser1.
  const demoUser = (await prisma.user.findUnique({ where: { username: "testuser1" } }))
    ?? (await prisma.user.findUnique({ where: { username: "testuser" } }));
  const demoMembership = demoUser
    ? await prisma.tenantMembership.findFirst({
        where: { userId: demoUser.id, active: true, tenant: { type: "RETAILER", active: true } },
        orderBy: { createdAt: "asc" },
      })
    : null;
  const source = demoMembership
    ? await prisma.tenant.findUnique({ where: { id: demoMembership.tenantId } })
    : await prisma.tenant.findFirst({ where: { name: "Comercio de Pruebas", type: "RETAILER", active: true } });

  let own = await prisma.tenant.findFirst({ where: { name: "Administración" } });
  if (!own) {
    own = await prisma.tenant.create({
      data: {
        name: "Administración",
        type: "RETAILER",
        notes: "Organización del superadmin: carrito y pedidos propios. Credenciales y vínculos se leen del comercio de pruebas.",
        mirrorsCommercialFromId: source?.id ?? null,
      },
    });
  } else if (source && own.mirrorsCommercialFromId !== source.id) {
    own = await prisma.tenant.update({
      where: { id: own.id },
      data: { mirrorsCommercialFromId: source.id },
    });
  }

  await prisma.tenantMembership.deleteMany({ where: { userId: user.id, tenantId: { not: own.id } } });
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: own.id, userId: user.id } },
    update: { role: "OWNER", title: "Superadmin de prueba", active: true },
    create: {
      tenantId: own.id,
      userId: user.id,
      role: "OWNER",
      title: "Superadmin de prueba",
    },
  });
  console.log(`OK ${user.username} en ${own.name} (credenciales de ${source?.name ?? "nadie todavía"})`);

  console.log(`OK superadmin: ${user.username} (${user.id}) en ${process.env.RAILWAY_ENVIRONMENT_NAME ?? "entorno desconocido"}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("FALLO:", err.message);
  process.exit(1);
});
