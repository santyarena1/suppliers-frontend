import type { PrismaService } from "../prisma/prisma.service";

export type CheckSeverity = "ok" | "warning" | "critical";

export interface IntegrityCheck {
  key: string;
  label: string;
  /** Qué significa si no da cero. */
  hint: string;
  /** Severidad cuando hay casos; con cero casos siempre es "ok". */
  severity: CheckSeverity;
  count: number;
  /** Hasta 10 ejemplos para ubicar el problema (nombres, nunca datos sensibles). */
  examples: string[];
}

type Def = {
  key: string;
  label: string;
  hint: string;
  severity: Exclude<CheckSeverity, "ok">;
  /** SQL que devuelve una fila por caso, con una columna `label`. */
  sql: string;
};

/**
 * Chequeos de integridad de la base. Cada uno devuelve los casos que no
 * deberían existir: lo que cruza datos entre organizaciones es crítico; lo que
 * es basura o configuración a revisar, advertencia.
 */
const CHECKS: Def[] = [
  {
    key: "cart_cross_org",
    label: "Ítems de carrito de alguien fuera de esa organización",
    hint: "Datos de carrito cruzados entre organizaciones.",
    severity: "critical",
    sql: `select u.username || ' en ' || t.name as label from "CartItem" ci join "User" u on u.id = ci."userId" join "Tenant" t on t.id = ci."tenantId"
          where u.role <> 'ROLE_ADMIN' and not exists (select 1 from "TenantMembership" m where m."userId" = ci."userId" and m."tenantId" = ci."tenantId")`,
  },
  {
    key: "orders_cross_org",
    label: "Pedidos hechos por alguien fuera de esa organización",
    hint: "Pedidos cruzados entre organizaciones (los del superadmin no cuentan).",
    severity: "critical",
    sql: `select u.username || ' → ' || t.name || ' (' || o.provider || ')' as label from "ProviderOrder" o join "User" u on u.id = o."userId" join "Tenant" t on t.id = o."tenantId"
          where u.role <> 'ROLE_ADMIN' and not exists (select 1 from "TenantMembership" m where m."userId" = o."userId" and m."tenantId" = o."tenantId")`,
  },
  {
    key: "credentials_cross_org",
    label: "Credenciales de proveedor guardadas por alguien de otra organización",
    hint: "Una cuenta de portal cargada desde afuera de la organización.",
    severity: "critical",
    sql: `select t.name || ' / ' || c."providerName" || ' (por ' || u.username || ')' as label from "Credential" c join "Tenant" t on t.id = c."tenantId" join "User" u on u.id = c."savedById"
          where u.role <> 'ROLE_ADMIN' and not exists (select 1 from "TenantMembership" m where m."userId" = c."savedById" and m."tenantId" = c."tenantId")`,
  },
  {
    key: "link_supplier_is_retailer",
    label: "Vínculos donde el proveedor es un comercio",
    hint: "Un comercio aparece como distribuidor de otro.",
    severity: "critical",
    sql: `select c.name || ' → ' || s.name as label from "TenantLink" l join "Tenant" s on s.id = l."supplierTenantId" join "Tenant" c on c.id = l."clientTenantId" where s.type = 'RETAILER'`,
  },
  {
    key: "provider_key_duplicated",
    label: "Clave de proveedor repetida",
    hint: "Dos organizaciones responden por el mismo proveedor.",
    severity: "critical",
    sql: `select "providerKey" as label from "Tenant" where "providerKey" is not null group by "providerKey" having count(*) > 1`,
  },
  {
    key: "users_multi_org",
    label: "Usuarios en más de una organización activa",
    hint: "Puede ser intencional, pero revisá que no tenga acceso de más.",
    severity: "warning",
    sql: `select u.username as label from "TenantMembership" m join "User" u on u.id = m."userId" where m.active group by u.username having count(*) > 1`,
  },
  {
    key: "active_links_inactive_org",
    label: "Vínculos activos con una organización desactivada",
    hint: "El vínculo sigue abierto aunque una de las partes está dada de baja.",
    severity: "warning",
    sql: `select c.name || ' → ' || s.name as label from "TenantLink" l join "Tenant" c on c.id = l."clientTenantId" join "Tenant" s on s.id = l."supplierTenantId"
          where l.status = 'ACTIVE' and (not c.active or not s.active)`,
  },
  {
    key: "retailers_without_owner",
    label: "Comercios o marcas activos sin dueño",
    hint: "Nadie puede administrarlos (los distribuidores integrados no cuentan).",
    severity: "warning",
    sql: `select t.name || ' (' || t.type || ')' as label from "Tenant" t where t.active and t.type <> 'DISTRIBUTOR'
          and exists (select 1 from "TenantMembership" m where m."tenantId" = t.id)
          and not exists (select 1 from "TenantMembership" m where m."tenantId" = t.id and m.role = 'OWNER' and m.active)`,
  },
  {
    key: "users_without_org",
    label: "Usuarios activos sin organización",
    hint: "Cuentas sueltas: conviene desactivarlas.",
    severity: "warning",
    sql: `select u.username as label from "User" u where u.active and u.role <> 'ROLE_ADMIN'
          and not exists (select 1 from "TenantMembership" m where m."userId" = u.id and m.active)`,
  },
  {
    key: "retailers_without_subscription",
    label: "Comercios sin suscripción",
    hint: "No se les puede aplicar plan ni vencimiento.",
    severity: "warning",
    sql: `select t.name as label from "Tenant" t where t.type = 'RETAILER' and not exists (select 1 from "Subscription" s where s."tenantId" = t.id)`,
  },
];

export async function runIntegrityChecks(prisma: PrismaService): Promise<IntegrityCheck[]> {
  const out: IntegrityCheck[] = [];
  for (const def of CHECKS) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ label: string }[]>(def.sql);
      out.push({
        key: def.key,
        label: def.label,
        hint: def.hint,
        severity: rows.length ? def.severity : "ok",
        count: rows.length,
        examples: rows.slice(0, 10).map((r) => String(r.label)),
      });
    } catch (err) {
      out.push({
        key: def.key,
        label: def.label,
        hint: `No se pudo correr el chequeo: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`,
        severity: "warning",
        count: 0,
        examples: [],
      });
    }
  }
  return out;
}
