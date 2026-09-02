"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminApi,
  adminBrandOrgsApi,
  AdminUser,
  ALL_PROVIDERS,
  BrandDisplay,
  PROVIDER_LABELS,
  Provider,
  TENANT_LINK_STATUS_LABELS,
  TENANT_ROLE_LABELS,
  TENANT_ROLES_BY_TYPE,
  TENANT_TYPE_LABELS,
  TenantLinkStatus,
  TenantNode,
  TenantRole,
  TenantTree,
  TenantType,
  TenantUserRelations,
  tenantsApi,
} from "@/lib/api";
import GeneratedPassword from "./GeneratedPassword";
import EnterAsButton from "./EnterAsButton";
import PlatformAccountPanel, { PLATFORM_ROLE_LABELS } from "./PlatformAccountPanel";
import {
  Building2,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Megaphone,
  Network,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Store,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

type ToastFn = (msg: string, ok?: boolean) => void;
type BrowseMode = "orgs" | "people";
type TypeFilter = TenantType | "all";
type Selection =
  | { kind: "tenant"; id: string }
  | { kind: "user"; id: string; tenantId: string | null };

type PersonRow = {
  userId: string;
  username: string;
  email: string;
  tenantId: string | null;
  tenantName: string | null;
  tenantType: TenantType | null;
  tenantRole: TenantRole | null;
  platformRole: AdminUser["role"];
  active: boolean;
};

const TYPE_ORDER: TenantType[] = ["RETAILER", "DISTRIBUTOR", "BRAND"];

const TYPE_GROUP_LABELS: Record<TenantType, string> = {
  RETAILER: "Comercios",
  DISTRIBUTOR: "Distribuidores",
  BRAND: "Marcas",
};

const TYPE_ICONS: Record<TenantType, React.ReactNode> = {
  RETAILER: <Store className="w-3.5 h-3.5" />,
  DISTRIBUTOR: <Building2 className="w-3.5 h-3.5" />,
  BRAND: <Tag className="w-3.5 h-3.5" />,
};

const TYPE_ACCENTS: Record<TenantType, string> = {
  RETAILER: "text-sky-400 bg-sky-500/10 border-sky-500/25",
  DISTRIBUTOR: "text-amber-400 bg-amber-500/10 border-amber-500/25",
  BRAND: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/25",
};

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

function decimalToNumber(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";
const labelClass = "block text-[11px] font-medium text-surface-400 mb-1";

export default function OrganizationsTree({ showToast }: { showToast: ToastFn }) {
  const [tree, setTree] = useState<TenantTree | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [brands, setBrands] = useState<BrandDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [browse, setBrowse] = useState<BrowseMode>("orgs");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePerson, setShowCreatePerson] = useState(false);
  const [syncingBrands, setSyncingBrands] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, usersRes, brandsRes] = await Promise.all([
        tenantsApi.tree(),
        adminApi.listUsers(),
        adminApi.listBrandDisplay().catch(() => ({ data: [] as BrandDisplay[] })),
      ]);
      setTree(treeRes.data);
      setUsers(usersRes.data);
      setBrands(brandsRes.data);
    } catch (err) {
      showToast(errMsg(err, "No se pudo cargar el árbol de organizaciones"), false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!tree) return [];
    const term = query.trim().toLowerCase();
    return tree.tenants.filter((tenant) => {
      if (typeFilter !== "all" && tenant.type !== typeFilter) return false;
      if (!term) return true;
      const haystack = [
        tenant.name,
        tenant.brand?.name ?? "",
        tenant.providerKey ? providerLabel(tenant.providerKey) : "",
        ...tenant.members.flatMap((member) => [member.username, member.email]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [tree, query, typeFilter]);

  const people = useMemo((): PersonRow[] => {
    if (!tree) return [];
    const rows: PersonRow[] = [];
    for (const tenant of tree.tenants) {
      if (typeFilter !== "all" && tenant.type !== typeFilter) continue;
      for (const member of tenant.members) {
        rows.push({
          userId: member.userId,
          username: member.username,
          email: member.email,
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantType: tenant.type,
          tenantRole: member.tenantRole,
          platformRole: member.platformRole,
          active: member.active && member.membershipActive && tenant.active,
        });
      }
    }
    if (typeFilter === "all") {
      for (const user of tree.unassignedUsers) {
        rows.push({
          userId: user.id,
          username: user.username,
          email: user.email,
          tenantId: null,
          tenantName: null,
          tenantType: null,
          tenantRole: null,
          platformRole: user.role,
          active: user.active,
        });
      }
    }
    const term = query.trim().toLowerCase();
    const matched = term
      ? rows.filter((row) =>
          [row.username, row.email, row.tenantName ?? "sin organización", PLATFORM_ROLE_LABELS[row.platformRole]]
            .join(" ")
            .toLowerCase()
            .includes(term)
        )
      : rows;
    return matched.sort((a, b) => a.username.localeCompare(b.username, "es"));
  }, [tree, query, typeFilter]);

  const unassignedFiltered = useMemo(() => {
    if (!tree || typeFilter !== "all") return [];
    const term = query.trim().toLowerCase();
    if (!term) return tree.unassignedUsers;
    return tree.unassignedUsers.filter((user) =>
      [user.username, user.email].join(" ").toLowerCase().includes(term)
    );
  }, [tree, query, typeFilter]);

  const selectedTenant = useMemo(() => {
    if (!tree || !selection) return null;
    const tenantId = selection.kind === "tenant" ? selection.id : selection.tenantId;
    return tree.tenants.find((tenant) => tenant.id === tenantId) ?? null;
  }, [tree, selection]);

  function toggle(tenantId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  const counts = TYPE_ORDER.map((type) => ({
    type,
    total: tree?.tenants.filter((tenant) => tenant.type === type).length ?? 0,
  }));
  const personCount = tree
    ? tree.tenants.reduce((sum, tenant) => sum + tenant.members.length, 0) + tree.unassignedUsers.length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-surface-800 overflow-hidden">
          {(
            [
              { key: "orgs" as const, label: "Organizaciones", icon: <Network className="w-3.5 h-3.5" /> },
              { key: "people" as const, label: "Personas", icon: <Users className="w-3.5 h-3.5" /> },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setBrowse(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                browse === opt.key ? "bg-brand-600 text-white" : "text-surface-400 hover:text-white hover:bg-surface-800"
              }`}
            >
              {opt.icon}
              {opt.label}
              <span className="text-[10px] opacity-80">
                {opt.key === "orgs" ? tree?.tenants.length ?? 0 : personCount}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar organización, persona, email, marca o proveedor"
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={() => setTypeFilter("all")}
          className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md border ${
            typeFilter === "all"
              ? "border-brand-500/40 bg-brand-600/15 text-brand-300"
              : "border-surface-700 text-surface-400 hover:text-surface-200"
          }`}
        >
          Todas
        </button>
        {counts.map(({ type, total }) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter((prev) => (prev === type ? "all" : type))}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md border ${
              typeFilter === type ? TYPE_ACCENTS[type] : "border-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {TYPE_ICONS[type]}
            {TYPE_GROUP_LABELS[type]} · {total}
          </button>
        ))}
        <button
          onClick={async () => {
            setSyncingBrands(true);
            try {
              const res = await adminBrandOrgsApi.sync();
              showToast(
                `Marcas del catálogo: ${res.data.created} orgs nuevas, ${res.data.linked} vinculadas, ${res.data.users} dueños placeholder`,
                true
              );
              await load();
            } catch (err) {
              showToast(errMsg(err, "No se pudieron asegurar las orgs de marca"), false);
            } finally {
              setSyncingBrands(false);
            }
          }}
          disabled={syncingBrands}
          className="flex items-center gap-1.5 bg-surface-800 hover:bg-surface-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all disabled:opacity-50"
        >
          {syncingBrands ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Orgs de marcas
        </button>
        <button
          onClick={() => setShowCreatePerson(true)}
          className="flex items-center gap-1.5 bg-surface-800 hover:bg-surface-700 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva persona
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva organización
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 items-start">
        <div className="flex flex-col gap-4">
          {browse === "people" ? (
            <div className="border border-surface-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-surface-900/60 border-b border-surface-800">
                <Users className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs font-semibold text-surface-200">Personas</span>
                <span className="text-[11px] text-surface-500">{people.length}</span>
              </div>
              {people.length === 0 ? (
                <p className="text-xs text-surface-500 px-4 py-6 text-center">Nadie coincide con la búsqueda.</p>
              ) : (
                <div className="divide-y divide-surface-800 max-h-[70vh] overflow-y-auto">
                  {people.map((row) => {
                    const selected = selection?.kind === "user" && selection.id === row.userId;
                    return (
                      <div
                        key={`${row.userId}-${row.tenantId ?? "none"}`}
                        className={`flex items-center gap-2 px-2 py-1.5 ${selected ? "bg-brand-600/10" : "hover:bg-surface-900/50"}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelection({ kind: "user", id: row.userId, tenantId: row.tenantId })}
                          className="min-w-0 flex-1 text-left px-1.5 py-1"
                        >
                          <p className={`text-sm truncate ${selected ? "text-white font-medium" : "text-surface-200"}`}>
                            {row.username}
                          </p>
                          <p className="text-[11px] text-surface-500 truncate">
                            {row.tenantName
                              ? `${row.tenantName} · ${row.tenantRole ? TENANT_ROLE_LABELS[row.tenantRole] : ""}`
                              : "Sin organización"}
                            {row.active ? "" : " · inactivo"}
                          </p>
                        </button>
                        <EnterAsButton
                          userId={row.userId}
                          role={row.platformRole}
                          showLabel={false}
                          onError={(message) => showToast(message, false)}
                          className="shrink-0 w-8 h-8"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
          {TYPE_ORDER.map((type) => {
            const group = filtered.filter((tenant) => tenant.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type} className="border border-surface-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-surface-900/60 border-b border-surface-800">
                  <span className={`w-5 h-5 rounded flex items-center justify-center ${TYPE_ACCENTS[type]}`}>
                    {TYPE_ICONS[type]}
                  </span>
                  <span className="text-xs font-semibold text-surface-200">{TYPE_GROUP_LABELS[type]}</span>
                  <span className="text-[11px] text-surface-500">{group.length}</span>
                </div>
                <div className="divide-y divide-surface-800">
                  {group.map((tenant) => (
                    <TenantBranch
                      key={tenant.id}
                      tenant={tenant}
                      open={expanded.has(tenant.id)}
                      selection={selection}
                      onToggle={() => toggle(tenant.id)}
                      onSelectTenant={() => setSelection({ kind: "tenant", id: tenant.id })}
                      onSelectUser={(userId) => setSelection({ kind: "user", id: userId, tenantId: tenant.id })}
                      showToast={showToast}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {unassignedFiltered.length > 0 && (
            <div className="border border-surface-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-surface-900/60 border-b border-surface-800">
                <UserRound className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-xs font-semibold text-surface-200">Sin organización</span>
                <span className="text-[11px] text-surface-500">{unassignedFiltered.length}</span>
              </div>
              <div className="divide-y divide-surface-800">
                {unassignedFiltered.map((user) => {
                  const selected = selection?.kind === "user" && selection.id === user.id;
                  return (
                    <div
                      key={user.id}
                      className={`flex items-center gap-2 px-2 py-1.5 ${selected ? "bg-brand-600/10" : "hover:bg-surface-900/50"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "user", id: user.id, tenantId: null })}
                        className="min-w-0 flex-1 text-left px-1.5 py-1"
                      >
                        <p className={`text-sm ${selected ? "text-white font-medium" : "text-surface-200"}`}>{user.username}</p>
                        <p className="text-[11px] text-surface-500">{user.email}</p>
                      </button>
                      <EnterAsButton
                        userId={user.id}
                        role={user.role}
                        showLabel={false}
                        onError={(message) => showToast(message, false)}
                        className="shrink-0 w-8 h-8"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-surface-500 px-3.5 py-2.5 border-t border-surface-800 leading-relaxed">
                Sin organización no hay alcance comercial. Abrilos y asignalos desde acá.
              </p>
            </div>
          )}

          {filtered.length === 0 && unassignedFiltered.length === 0 && (
            <p className="text-xs text-surface-500 border border-surface-800 rounded-xl px-4 py-6 text-center">
              No hay organizaciones ni personas que coincidan con la búsqueda.
            </p>
          )}
            </>
          )}
        </div>

        <div className="min-w-0">
          {selection?.kind === "user" ? (
            <UserRelationsPanel
              userId={selection.id}
              tenant={selectedTenant}
              users={users}
              brands={brands}
              tree={tree!}
              onBack={() =>
                selectedTenant
                  ? setSelection({ kind: "tenant", id: selectedTenant.id })
                  : setSelection(null)
              }
              onChanged={load}
              onDeleted={() => {
                setSelection(null);
                load();
              }}
              showToast={showToast}
            />
          ) : selectedTenant ? (
            <TenantPanel
              tenant={selectedTenant}
              tree={tree!}
              users={users}
              brands={brands}
              onChanged={load}
              onSelectUser={(userId) => setSelection({ kind: "user", id: userId, tenantId: selectedTenant.id })}
              showToast={showToast}
            />
          ) : (
            <div className="border border-surface-800 rounded-xl px-5 py-10 text-center">
              <Building2 className="w-6 h-6 text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-300">Elegí una organización o una persona</p>
              <p className="text-xs text-surface-500 mt-1.5 leading-relaxed max-w-sm mx-auto">
                Acá se administra todo: organizaciones, gente, roles internos, cuenta de Nodo, módulos, vínculos y
                “Entrar como”.
              </p>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateTenantModal
          brands={brands}
          usedProviders={(tree?.tenants.map((tenant) => tenant.providerKey).filter(Boolean) as Provider[]) ?? []}
          usedBrandIds={(tree?.tenants.map((tenant) => tenant.brand?.id).filter(Boolean) as string[]) ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
          showToast={showToast}
        />
      )}
      {showCreatePerson && tree && (
        <CreatePersonModal
          tree={tree}
          users={users}
          onClose={() => setShowCreatePerson(false)}
          onDone={() => {
            setShowCreatePerson(false);
            load();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ---------- Rama del árbol ----------

function TenantBranch({
  tenant,
  open,
  selection,
  onToggle,
  onSelectTenant,
  onSelectUser,
  showToast,
}: {
  tenant: TenantNode;
  open: boolean;
  selection: Selection | null;
  onToggle: () => void;
  onSelectTenant: () => void;
  onSelectUser: (userId: string) => void;
  showToast: ToastFn;
}) {
  const isSelected = selection?.kind === "tenant" && selection.id === tenant.id;
  const roleGroups = TENANT_ROLES_BY_TYPE[tenant.type]
    .map((role) => ({ role, members: tenant.members.filter((member) => member.tenantRole === role) }))
    .filter((group) => group.members.length > 0);
  const linkCount = tenant.suppliers.length + tenant.clients.length;
  // Solo vale la pena aclararlo cuando el catálogo usa otro nombre que la organización.
  const catalogName = tenant.providerKey ? providerLabel(tenant.providerKey) : tenant.brand?.name;

  return (
    <div className={isSelected ? "bg-brand-600/10" : undefined}>
      <div className="flex items-center gap-1.5 px-2 py-2">
        <button
          onClick={onToggle}
          className="w-5 h-5 flex items-center justify-center text-surface-500 hover:text-surface-200 transition-colors flex-shrink-0"
          aria-label={open ? "Contraer" : "Expandir"}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button onClick={onSelectTenant} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className={`text-sm truncate ${isSelected ? "text-white font-medium" : "text-surface-200"}`}>
              {tenant.name}
            </span>
            {!tenant.active && (
              <span className="text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/25 rounded px-1.5 py-0.5 flex-shrink-0">
                Inactiva
              </span>
            )}
            {tenant.advertisingEnabled && (
              <Megaphone className="w-3 h-3 text-emerald-400 flex-shrink-0" aria-label="Publicidad activa" />
            )}
          </div>
          <p className="text-[11px] text-surface-500 truncate">
            {tenant.members.length} {tenant.members.length === 1 ? "persona" : "personas"}
            {linkCount > 0 ? ` · ${linkCount} ${linkCount === 1 ? "vínculo" : "vínculos"}` : ""}
            {catalogName && catalogName !== tenant.name ? ` · ${catalogName}` : ""}
          </p>
        </button>
      </div>

      {open && (
        <div className="pl-8 pr-2 pb-2 flex flex-col gap-2">
          {roleGroups.length === 0 && (
            <p className="text-[11px] text-surface-500 py-1">Todavía no hay personas en esta organización.</p>
          )}
          {roleGroups.map(({ role, members }) => (
            <div key={role}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-500 mb-1">
                {TENANT_ROLE_LABELS[role]}
              </p>
              <div className="flex flex-col">
                {members.map((member) => {
                  const active = selection?.kind === "user" && selection.id === member.userId;
                  return (
                    <div
                      key={member.membershipId}
                      className={`flex items-center gap-1 rounded-md ${
                        active ? "bg-brand-600/20" : "hover:bg-surface-800/60"
                      }`}
                    >
                      <button
                        onClick={() => onSelectUser(member.userId)}
                        className={`flex min-w-0 flex-1 items-center gap-2 text-left px-2 py-1.5 ${
                          active ? "text-white" : "text-surface-300"
                        }`}
                      >
                        <UserRound className="w-3 h-3 text-surface-500 flex-shrink-0" />
                        <span className="text-xs truncate">{member.username}</span>
                        {member.title && <span className="text-[10px] text-surface-500 truncate">{member.title}</span>}
                        {(!member.active || !member.membershipActive) && (
                          <span className="text-[10px] text-red-400 flex-shrink-0">inactivo</span>
                        )}
                      </button>
                      <EnterAsButton
                        userId={member.userId}
                        role={member.platformRole}
                        showLabel={false}
                        onError={(message) => showToast(message, false)}
                        className="shrink-0 w-7 h-7 mr-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Panel de organización ----------

function TenantPanel({
  tenant,
  tree,
  users,
  brands,
  onChanged,
  onSelectUser,
  showToast,
}: {
  tenant: TenantNode;
  tree: TenantTree;
  users: AdminUser[];
  brands: BrandDisplay[];
  onChanged: () => void;
  onSelectUser: (userId: string) => void;
  showToast: ToastFn;
}) {
  const [profile, setProfile] = useState({
    name: tenant.name,
    contactEmail: tenant.contactEmail ?? "",
    contactPhone: tenant.contactPhone ?? "",
    notes: tenant.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  useEffect(() => {
    setProfile({
      name: tenant.name,
      contactEmail: tenant.contactEmail ?? "",
      contactPhone: tenant.contactPhone ?? "",
      notes: tenant.notes ?? "",
    });
  }, [tenant]);

  async function run(action: () => Promise<unknown>, okMessage: string, fallback: string) {
    try {
      await action();
      showToast(okMessage);
      onChanged();
    } catch (err) {
      showToast(errMsg(err, fallback), false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await tenantsApi.update(tenant.id, {
        name: profile.name.trim(),
        contactEmail: profile.contactEmail.trim() || null,
        contactPhone: profile.contactPhone.trim() || null,
        notes: profile.notes.trim() || null,
      });
      showToast("Organización actualizada");
      onChanged();
    } catch (err) {
      showToast(errMsg(err, "No se pudo guardar la organización"), false);
    } finally {
      setSaving(false);
    }
  }

  const isSupplierSide = tenant.type !== "RETAILER";
  const availableCounterparts = tree.tenants.filter((other) =>
    isSupplierSide ? other.type === "RETAILER" : other.type !== "RETAILER"
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="border border-surface-800 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-7 h-7 rounded-md flex items-center justify-center border ${TYPE_ACCENTS[tenant.type]}`}>
              {TYPE_ICONS[tenant.type]}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{tenant.name}</h2>
              <p className="text-[11px] text-surface-500">
                {TENANT_TYPE_LABELS[tenant.type]}
                {tenant.providerKey ? ` · Catálogo de ${providerLabel(tenant.providerKey)}` : ""}
                {tenant.brand ? ` · Marca ${tenant.brand.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => run(() => tenantsApi.update(tenant.id, { active: !tenant.active }), tenant.active ? "Organización desactivada" : "Organización activada", "No se pudo cambiar el estado")}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-md border ${
                tenant.active
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-red-500/10 border-red-500/25 text-red-400"
              }`}
            >
              {tenant.active ? "Activa" : "Inactiva"}
            </button>
            <button
              onClick={() => {
                if (!window.confirm(`¿Eliminar la organización ${tenant.name}?`)) return;
                run(() => tenantsApi.remove(tenant.id), "Organización eliminada", "No se pudo eliminar");
              }}
              className="text-surface-500 hover:text-red-400 transition-colors"
              aria-label="Eliminar organización"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Nombre</label>
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email de contacto</label>
            <input value={profile.contactEmail} onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Teléfono</label>
            <input value={profile.contactPhone} onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Notas internas</label>
            <input value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} className={inputClass} />
          </div>
        </div>

        {tenant.type === "BRAND" && (
          <div className="mt-3">
            <label className={labelClass}>Marca del catálogo asociada</label>
            <select
              value={tenant.brand?.id ?? ""}
              onChange={(e) =>
                run(
                  () => tenantsApi.update(tenant.id, { brandId: e.target.value || null }),
                  "Marca asociada actualizada",
                  "No se pudo asociar la marca"
                )
              }
              className={inputClass}
            >
              <option value="">Sin marca asociada</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {tenant.type === "DISTRIBUTOR" && (
          <div className="mt-3">
            <label className={labelClass}>Proveedor del catálogo</label>
            <select
              value={tenant.providerKey ?? ""}
              onChange={(e) =>
                run(
                  () => tenantsApi.update(tenant.id, { providerKey: (e.target.value || null) as Provider | null }),
                  "Proveedor actualizado",
                  "No se pudo asignar el proveedor"
                )
              }
              className={inputClass}
            >
              <option value="">Sin integración por API</option>
              {ALL_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {providerLabel(provider)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-4">
          {isSupplierSide ? (
            <label className="flex items-center gap-2 text-xs text-surface-300">
              <input
                type="checkbox"
                checked={tenant.advertisingEnabled}
                onChange={(e) =>
                  run(
                    () => tenantsApi.update(tenant.id, { advertisingEnabled: e.target.checked }),
                    e.target.checked ? "Publicidad activada" : "Publicidad desactivada",
                    "No se pudo cambiar la publicidad"
                  )
                }
                className="accent-brand-600"
              />
              Publicidad paga: pueden contratar espacios. El descubrimiento cerrado solo se abre si además tienen una campaña activa en Descubrimiento.
            </label>
          ) : (
            <span />
          )}
          <button
            onClick={saveProfile}
            disabled={saving}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3.5 py-2 transition-all"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Guardar cambios"}
          </button>
        </div>
      </section>

      <MembersSection
        tenant={tenant}
        users={users}
        onSelectUser={onSelectUser}
        onChanged={onChanged}
        showToast={showToast}
        showAdd={showAddMember}
        setShowAdd={setShowAddMember}
      />

      <LinksSection
        tenant={tenant}
        counterparts={availableCounterparts}
        onChanged={onChanged}
        showToast={showToast}
      />

      {isSupplierSide && <AccessCodesSection tenant={tenant} onChanged={onChanged} showToast={showToast} />}
    </div>
  );
}

// ---------- Personas ----------

function MembersSection({
  tenant,
  users,
  onSelectUser,
  onChanged,
  showToast,
  showAdd,
  setShowAdd,
}: {
  tenant: TenantNode;
  users: AdminUser[];
  onSelectUser: (userId: string) => void;
  onChanged: () => void;
  showToast: ToastFn;
  showAdd: boolean;
  setShowAdd: (value: boolean) => void;
}) {
  const roles = TENANT_ROLES_BY_TYPE[tenant.type];

  async function run(action: () => Promise<unknown>, okMessage: string, fallback: string) {
    try {
      await action();
      showToast(okMessage);
      onChanged();
    } catch (err) {
      showToast(errMsg(err, fallback), false);
    }
  }

  return (
    <section className="border border-surface-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white">Personas ({tenant.members.length})</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>

      {tenant.members.length === 0 ? (
        <p className="text-xs text-surface-500">Todavía no hay personas en esta organización.</p>
      ) : (
        <div className="border border-surface-800 rounded-lg divide-y divide-surface-800">
          {tenant.members.map((member) => (
            <div key={member.membershipId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <button onClick={() => onSelectUser(member.userId)} className="flex-1 min-w-[160px] text-left">
                <p className="text-sm text-surface-200">{member.username}</p>
                <p className="text-[11px] text-surface-500">{member.email}</p>
              </button>
              <EnterAsButton
                userId={member.userId}
                role={member.platformRole}
                showLabel={false}
                onError={(message) => showToast(message, false)}
                className="shrink-0 w-8 h-8"
              />

              <input
                defaultValue={member.title ?? ""}
                placeholder="Cargo"
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value === (member.title ?? "")) return;
                  run(
                    () => tenantsApi.updateMember(member.membershipId, { title: value || null }),
                    "Cargo actualizado",
                    "No se pudo guardar el cargo"
                  );
                }}
                className="w-28 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />

              <select
                value={member.tenantRole}
                onChange={(e) =>
                  run(
                    () => tenantsApi.updateMember(member.membershipId, { role: e.target.value as TenantRole }),
                    "Rol actualizado",
                    "No se pudo cambiar el rol"
                  )
                }
                className="bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {TENANT_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>

              <button
                onClick={() =>
                  run(
                    () => tenantsApi.updateMember(member.membershipId, { active: !member.membershipActive }),
                    member.membershipActive ? "Membresía suspendida" : "Membresía reactivada",
                    "No se pudo cambiar el estado"
                  )
                }
                className={`text-[11px] font-medium px-2 py-1.5 rounded-md border ${
                  member.membershipActive
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                    : "bg-red-500/10 border-red-500/25 text-red-400"
                }`}
              >
                {member.membershipActive ? "Activa" : "Suspendida"}
              </button>

              <button
                onClick={() => {
                  if (!window.confirm(`¿Quitar a ${member.username} de ${tenant.name}?`)) return;
                  run(() => tenantsApi.removeMember(member.membershipId), "Persona quitada", "No se pudo quitar");
                }}
                className="text-surface-500 hover:text-red-400 transition-colors"
                aria-label="Quitar de la organización"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {member.tenantRole === "PRODUCT_MANAGER" && (
                <div className="w-full">
                  <label className={labelClass}>Marcas que administra dentro de {tenant.name}</label>
                  <input
                    defaultValue={(member.managedBrands ?? []).join(", ")}
                    placeholder="Separadas por coma"
                    onBlur={(e) => {
                      const brandNames = e.target.value
                        .split(",")
                        .map((name) => name.trim())
                        .filter(Boolean);
                      run(
                        () => tenantsApi.setManagedBrands(member.membershipId, brandNames),
                        "Marcas del Product Manager actualizadas",
                        "No se pudieron guardar las marcas"
                      );
                    }}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddMemberModal
          tenant={tenant}
          users={users}
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            onChanged();
          }}
          showToast={showToast}
        />
      )}
    </section>
  );
}

// ---------- Vínculos ----------

function LinksSection({
  tenant,
  counterparts,
  onChanged,
  showToast,
}: {
  tenant: TenantNode;
  counterparts: TenantNode[];
  onChanged: () => void;
  showToast: ToastFn;
}) {
  const isRetailer = tenant.type === "RETAILER";
  const links = isRetailer ? tenant.suppliers : tenant.clients;
  const [newCounterpart, setNewCounterpart] = useState("");

  const linkedIds = new Set(links.map((link) => link.tenant?.id));
  const options = counterparts.filter((option) => option.id !== tenant.id && !linkedIds.has(option.id));

  async function run(action: () => Promise<unknown>, okMessage: string, fallback: string) {
    try {
      await action();
      showToast(okMessage);
      onChanged();
    } catch (err) {
      showToast(errMsg(err, fallback), false);
    }
  }

  function upsert(counterpartId: string, patch: Record<string, unknown>) {
    return tenantsApi.upsertLink({
      clientTenantId: isRetailer ? tenant.id : counterpartId,
      supplierTenantId: isRetailer ? counterpartId : tenant.id,
      ...patch,
    });
  }

  return (
    <section className="border border-surface-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="w-3.5 h-3.5 text-surface-400" />
        <h3 className="text-xs font-semibold text-white">
          {isRetailer ? `Proveedores y marcas vinculados (${links.length})` : `Comercios vinculados (${links.length})`}
        </h3>
      </div>
      <p className="text-[11px] text-surface-500 mb-3 leading-relaxed">
        {isRetailer
          ? "Este comercio solo puede ver el catálogo y los precios de las organizaciones que figuran acá."
          : "Solo estos comercios ven a esta organización. Asignales el vendedor que los atiende."}
      </p>

      {links.length > 0 && (
        <div className="border border-surface-800 rounded-lg divide-y divide-surface-800 mb-3">
          {links.map((link) => (
            <div key={link.linkId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="flex-1 min-w-[150px]">
                <p className="text-sm text-surface-200">{link.tenant?.name ?? "—"}</p>
                <p className="text-[11px] text-surface-500">
                  {link.tenant ? TENANT_TYPE_LABELS[link.tenant.type] : ""}
                  {link.accountManager ? ` · Vendedor: ${link.accountManager.username}` : ""}
                </p>
              </div>

              {!isRetailer && (
                <select
                  value={link.accountManager?.id ?? ""}
                  onChange={(e) =>
                    run(
                      () => upsert(link.tenant!.id, { accountManagerId: e.target.value || null }),
                      "Vendedor asignado",
                      "No se pudo asignar el vendedor"
                    )
                  }
                  className="bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">Sin vendedor asignado</option>
                  {tenant.members
                    .filter((member) => member.tenantRole === "SELLER" || member.tenantRole === "OWNER")
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.username}
                      </option>
                    ))}
                </select>
              )}

              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                defaultValue={decimalToNumber(link.discountPercent) ?? ""}
                placeholder="% desc."
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const value = raw === "" ? null : Number(raw);
                  if (value === decimalToNumber(link.discountPercent)) return;
                  run(
                    () => upsert(link.tenant!.id, { discountPercent: value }),
                    "Descuento actualizado",
                    "No se pudo guardar el descuento"
                  );
                }}
                className="w-20 bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
              />

              <select
                value={link.status}
                onChange={(e) =>
                  run(
                    () => upsert(link.tenant!.id, { status: e.target.value as TenantLinkStatus }),
                    "Estado del vínculo actualizado",
                    "No se pudo cambiar el estado"
                  )
                }
                className="bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                {(Object.keys(TENANT_LINK_STATUS_LABELS) as TenantLinkStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {TENANT_LINK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>

              <button
                onClick={() => {
                  if (!window.confirm("¿Eliminar el vínculo?")) return;
                  run(() => tenantsApi.deleteLink(link.linkId), "Vínculo eliminado", "No se pudo eliminar el vínculo");
                }}
                className="text-surface-500 hover:text-red-400 transition-colors"
                aria-label="Eliminar vínculo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value={newCounterpart}
          onChange={(e) => setNewCounterpart(e.target.value)}
          className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
        >
          <option value="">{isRetailer ? "Vincular un distribuidor o marca…" : "Vincular un comercio…"}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name} · {TENANT_TYPE_LABELS[option.type]}
            </option>
          ))}
        </select>
        <button
          disabled={!newCounterpart}
          onClick={() => {
            const target = newCounterpart;
            setNewCounterpart("");
            run(() => upsert(target, { status: "ACTIVE" }), "Vínculo creado", "No se pudo crear el vínculo");
          }}
          className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
        >
          Vincular
        </button>
      </div>
    </section>
  );
}

// ---------- Códigos de vinculación ----------

function AccessCodesSection({
  tenant,
  onChanged,
  showToast,
}: {
  tenant: TenantNode;
  onChanged: () => void;
  showToast: ToastFn;
}) {
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const active = tenant.accessCodes.filter((code) => !code.revoked);

  async function create() {
    setCreating(true);
    try {
      await tenantsApi.createAccessCode(tenant.id, { label: label.trim() || undefined, maxUses: 1 });
      setLabel("");
      showToast("Código generado");
      onChanged();
    } catch (err) {
      showToast(errMsg(err, "No se pudo generar el código"), false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="border border-surface-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <QrCode className="w-3.5 h-3.5 text-surface-400" />
        <h3 className="text-xs font-semibold text-white">Códigos de vinculación ({active.length})</h3>
      </div>
      <p className="text-[11px] text-surface-500 mb-3 leading-relaxed">
        Se entregan por fuera de Nodo. Al canjearlos, el comercio se vincula sin que se revele el
        listado de organizaciones existentes.
      </p>

      {active.length > 0 && (
        <div className="border border-surface-800 rounded-lg divide-y divide-surface-800 mb-3">
          {active.map((code) => (
            <div key={code.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-surface-200 tracking-wide">{code.code}</p>
                <p className="text-[11px] text-surface-500">
                  {code.label || "Sin etiqueta"} · {code.usedCount} de {code.maxUses} usos
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(code.code);
                  showToast("Código copiado");
                }}
                className="text-surface-500 hover:text-surface-200 transition-colors"
                aria-label="Copiar código"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => {
                  try {
                    await tenantsApi.revokeAccessCode(code.id);
                    showToast("Código revocado");
                    onChanged();
                  } catch (err) {
                    showToast(errMsg(err, "No se pudo revocar"), false);
                  }
                }}
                className="text-surface-500 hover:text-red-400 transition-colors"
                aria-label="Revocar código"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etiqueta para identificarlo (opcional)"
          className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
        />
        <button
          onClick={create}
          disabled={creating}
          className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generar código"}
        </button>
      </div>
    </section>
  );
}

// ---------- Relaciones de una persona ----------

function UserRelationsPanel({
  userId,
  tenant,
  users,
  brands,
  tree,
  onBack,
  onChanged,
  onDeleted,
  showToast,
}: {
  userId: string;
  tenant: TenantNode | null;
  users: AdminUser[];
  brands: BrandDisplay[];
  tree: TenantTree;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  showToast: ToastFn;
}) {
  const [relations, setRelations] = useState<TenantUserRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const member = tenant?.members.find((candidate) => candidate.userId === userId);
  const unassigned = tree.unassignedUsers.find((candidate) => candidate.id === userId);
  const account =
    users.find((candidate) => candidate.id === userId) ??
    (member
      ? {
          id: member.userId,
          username: member.username,
          email: member.email,
          role: member.platformRole,
          active: member.active,
          endDate: member.endDate,
          createdAt: "",
          tenantId: tenant?.id ?? null,
          tenantName: tenant?.name ?? null,
        }
      : unassigned
        ? {
            id: unassigned.id,
            username: unassigned.username,
            email: unassigned.email,
            role: unassigned.role,
            active: unassigned.active,
            endDate: unassigned.endDate,
            createdAt: "",
            tenantId: null,
            tenantName: null,
          }
        : null);

  useEffect(() => {
    setLoading(true);
    tenantsApi
      .userRelations(userId)
      .then((res) => setRelations(res.data))
      .catch((err) => showToast(errMsg(err, "No se pudieron cargar las relaciones"), false))
      .finally(() => setLoading(false));
  }, [userId, showToast]);

  return (
    <div className="flex flex-col gap-4">
      <section className="border border-surface-800 rounded-xl p-4">
        {tenant ? (
          <button onClick={onBack} className="text-[11px] text-brand-400 hover:text-brand-300 mb-3">
            ← Volver a {tenant.name}
          </button>
        ) : (
          <p className="text-[11px] text-amber-300 mb-3">Esta persona todavía no está en ninguna organización.</p>
        )}
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-surface-800 flex items-center justify-center">
            <UserRound className="w-3.5 h-3.5 text-surface-300" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white truncate">
              {account?.username ?? member?.username ?? "Persona"}
            </h2>
            <p className="text-[11px] text-surface-500 truncate">
              {account?.email ?? member?.email}
              {member && tenant ? ` · ${TENANT_ROLE_LABELS[member.tenantRole]} en ${tenant.name}` : ""}
              {account ? ` · ${PLATFORM_ROLE_LABELS[account.role]}` : ""}
            </p>
          </div>
          {account && (
            <EnterAsButton
              userId={account.id}
              role={account.role}
              variant="primary"
              onError={(message) => showToast(message, false)}
              className="shrink-0 px-3 py-2"
            />
          )}
        </div>
        {member?.managedBrands && member.managedBrands.length > 0 && tenant && (
          <p className="text-[11px] text-surface-400 mt-3">
            Administra las marcas {member.managedBrands.join(", ")} dentro de {tenant.name}.
          </p>
        )}
      </section>

      {account && (
        <PlatformAccountPanel
          key={account.id}
          user={account}
          brands={brands}
          onReload={onChanged}
          onDeleted={onDeleted}
          showToast={showToast}
        />
      )}

      {!tenant && account && (
        <AssignOrgSection userId={account.id} tree={tree} onChanged={onChanged} showToast={showToast} />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        </div>
      ) : (
        relations && (
          <>
            {relations.organizations.map((organization) => (
              <section key={organization.membershipId} className="border border-surface-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-white mb-1">
                  {organization.tenant.name} · {TENANT_TYPE_LABELS[organization.tenant.type]}
                </h3>
                <p className="text-[11px] text-surface-500 mb-3">
                  Rol interno: {TENANT_ROLE_LABELS[organization.role]}
                  {organization.title ? ` · ${organization.title}` : ""}
                </p>

                <RelationList
                  title="Relación directa · equipo interno"
                  empty="Es la única persona de la organización."
                  items={organization.colleagues.map((colleague) => ({
                    key: colleague.membershipId,
                    primary: colleague.username,
                    secondary: `${TENANT_ROLE_LABELS[colleague.tenantRole]}${colleague.title ? ` · ${colleague.title}` : ""}`,
                  }))}
                />

                {organization.suppliers.length > 0 && (
                  <RelationList
                    title="Relación indirecta · proveedores de su organización"
                    empty=""
                    items={organization.suppliers.map((link) => ({
                      key: link.linkId,
                      primary: link.tenant?.name ?? "—",
                      secondary: `${link.tenant ? TENANT_TYPE_LABELS[link.tenant.type] : ""} · ${TENANT_LINK_STATUS_LABELS[link.status]}${
                        link.accountManager ? ` · Vendedor: ${link.accountManager.username}` : ""
                      }`,
                    }))}
                  />
                )}

                {organization.clients.length > 0 && (
                  <RelationList
                    title="Relación indirecta · comercios de su organización"
                    empty=""
                    items={organization.clients.map((link) => ({
                      key: link.linkId,
                      primary: link.tenant?.name ?? "—",
                      secondary: `${TENANT_LINK_STATUS_LABELS[link.status]}${
                        link.accountManager ? ` · Vendedor: ${link.accountManager.username}` : ""
                      }`,
                    }))}
                  />
                )}
              </section>
            ))}

            <section className="border border-surface-800 rounded-xl p-4">
              <RelationList
                title="Relación directa · cuentas que atiende"
                empty="No tiene comercios asignados como vendedor."
                items={relations.assignedAccounts.map((account) => ({
                  key: account.linkId,
                  primary: account.client.name,
                  secondary: `Cliente de ${account.supplier.name} · ${TENANT_LINK_STATUS_LABELS[account.status]}`,
                }))}
              />
            </section>

            {member && tenant && (
              <section className="border border-surface-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-white mb-3">Acciones</h3>
                <button
                  onClick={async () => {
                    if (!window.confirm(`¿Quitar a ${member.username} de ${tenant.name}?`)) return;
                    try {
                      await tenantsApi.removeMember(member.membershipId);
                      showToast("Persona quitada de la organización");
                      onBack();
                      onChanged();
                    } catch (err) {
                      showToast(errMsg(err, "No se pudo quitar"), false);
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Quitar de {tenant.name}
                </button>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}

function RelationList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { key: string; primary: string; secondary: string }[];
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-500 mb-1.5">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-surface-500">{empty}</p>
      ) : (
        <div className="border border-surface-800 rounded-lg divide-y divide-surface-800">
          {items.map((item) => (
            <div key={item.key} className="px-3 py-2">
              <p className="text-sm text-surface-200">{item.primary}</p>
              <p className="text-[11px] text-surface-500">{item.secondary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Modales ----------

function CreateTenantModal({
  brands,
  usedProviders,
  usedBrandIds,
  onClose,
  onCreated,
  showToast,
}: {
  brands: BrandDisplay[];
  usedProviders: Provider[];
  usedBrandIds: string[];
  onClose: () => void;
  onCreated: () => void;
  showToast: ToastFn;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "RETAILER" as TenantType,
    providerKey: "",
    brandId: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await tenantsApi.create({
        name: form.name.trim(),
        type: form.type,
        providerKey: form.type === "DISTRIBUTOR" && form.providerKey ? (form.providerKey as Provider) : undefined,
        brandId: form.type === "BRAND" && form.brandId ? form.brandId : undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      });
      showToast("Organización creada");
      onCreated();
    } catch (err) {
      showToast(errMsg(err, "No se pudo crear la organización"), false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Nueva organización</h3>
          <button onClick={onClose} className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className={labelClass}>Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as TenantType, providerKey: "", brandId: "" })}
              className={inputClass}
            >
              {TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {TENANT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Nombre</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          {form.type === "DISTRIBUTOR" && (
            <div>
              <label className={labelClass}>Proveedor del catálogo</label>
              <select value={form.providerKey} onChange={(e) => setForm({ ...form, providerKey: e.target.value })} className={inputClass}>
                <option value="">Sin integración por API</option>
                {ALL_PROVIDERS.filter((provider) => !usedProviders.includes(provider)).map((provider) => (
                  <option key={provider} value={provider}>
                    {providerLabel(provider)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.type === "BRAND" && (
            <div>
              <label className={labelClass}>Marca del catálogo asociada</label>
              <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })} className={inputClass}>
                <option value="">Sin marca asociada</option>
                {brands
                  .filter((brand) => !usedBrandIds.includes(brand.id))
                  .map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div>
            <label className={labelClass}>Email de contacto</label>
            <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Teléfono</label>
            <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all mt-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear organización"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddMemberModal({
  tenant,
  users,
  onClose,
  onDone,
  showToast,
  orgPicker,
}: {
  tenant: TenantNode;
  users: AdminUser[];
  onClose: () => void;
  onDone: () => void;
  showToast: ToastFn;
  orgPicker?: { tenants: TenantNode[]; value: string; onChange: (id: string) => void };
}) {
  const roles = TENANT_ROLES_BY_TYPE[tenant.type];
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [role, setRole] = useState<TenantRole>(roles.includes("OWNER") ? "OWNER" : roles[0]);
  const [title, setTitle] = useState("");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [existingId, setExistingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState<{ username: string; password: string } | null>(null);

  const memberIds = new Set(tenant.members.map((member) => member.userId));
  const candidates = users.filter((user) => !memberIds.has(user.id));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (mode === "new") {
        const { data } = await tenantsApi.createMemberUser(tenant.id, {
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password.trim() || undefined,
          role,
          title: title.trim() || undefined,
        });
        showToast("Persona agregada a la organización");
        if (data.generatedPassword) {
          setGenerated({ username: form.username.trim(), password: data.generatedPassword });
        } else {
          onDone();
        }
      } else {
        await tenantsApi.addMember(tenant.id, { userId: existingId, role, title: title.trim() || undefined });
        showToast("Persona agregada a la organización");
        onDone();
      }
    } catch (err) {
      showToast(errMsg(err, "No se pudo agregar la persona"), false);
    } finally {
      setSaving(false);
    }
  }

  if (generated) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-white">
            Contraseña de <span className="text-brand-400">{generated.username}</span>
          </h3>
          <GeneratedPassword password={generated.password} onDismiss={onDone} />
          <button
            type="button"
            onClick={onDone}
            className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
          >
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">{orgPicker ? "Nueva persona" : `Agregar a ${tenant.name}`}</h3>
          <button onClick={onClose} className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {orgPicker && (
          <div className="mb-4">
            <label className={labelClass}>Organización</label>
            <select
              value={orgPicker.value}
              onChange={(e) => orgPicker.onChange(e.target.value)}
              className={inputClass}
            >
              {orgPicker.tenants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {TENANT_TYPE_LABELS[item.type]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-1 mb-4">
          {(["new", "existing"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors ${
                mode === value
                  ? "bg-brand-600/15 border-brand-500/40 text-brand-300"
                  : "border-surface-700 text-surface-400 hover:text-surface-200"
              }`}
            >
              {value === "new" ? "Usuario nuevo" : "Usuario existente"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "new" ? (
            <>
              <div>
                <label className={labelClass}>Nombre de usuario</label>
                <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Contraseña (vacío = generar una)</label>
                <input minLength={8} type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
              </div>
            </>
          ) : (
            <div>
              <label className={labelClass}>Usuario</label>
              <select required value={existingId} onChange={(e) => setExistingId(e.target.value)} className={inputClass}>
                <option value="">Elegí un usuario…</option>
                {candidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username} · {user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>Rol dentro de la organización</label>
            <select value={role} onChange={(e) => setRole(e.target.value as TenantRole)} className={inputClass}>
              {roles.map((option) => (
                <option key={option} value={option}>
                  {TENANT_ROLE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Cargo (opcional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gerente comercial, encargado de compras…" className={inputClass} />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all mt-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Agregar persona"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AssignOrgSection({
  userId,
  tree,
  onChanged,
  showToast,
}: {
  userId: string;
  tree: TenantTree;
  onChanged: () => void;
  showToast: ToastFn;
}) {
  const [tenantId, setTenantId] = useState(tree.tenants[0]?.id ?? "");
  const tenant = tree.tenants.find((item) => item.id === tenantId) ?? null;
  const roles = tenant ? TENANT_ROLES_BY_TYPE[tenant.type] : [];
  const [role, setRole] = useState<TenantRole>(roles[0] ?? "ADMIN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = tree.tenants.find((item) => item.id === tenantId);
    if (!current) return;
    const next = TENANT_ROLES_BY_TYPE[current.type];
    setRole(next.includes("OWNER") ? "OWNER" : next[0]);
  }, [tenantId, tree.tenants]);

  async function assign() {
    if (!tenant) return;
    setSaving(true);
    try {
      await tenantsApi.addMember(tenant.id, { userId, role });
      showToast(`Asignado a ${tenant.name}`);
      onChanged();
    } catch (err) {
      showToast(errMsg(err, "No se pudo asignar"), false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-white">Asignar a una organización</h3>
      <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputClass}>
        {tree.tenants.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {TENANT_TYPE_LABELS[item.type]}
          </option>
        ))}
      </select>
      {tenant && (
        <select value={role} onChange={(e) => setRole(e.target.value as TenantRole)} className={inputClass}>
          {roles.map((option) => (
            <option key={option} value={option}>
              {TENANT_ROLE_LABELS[option]}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={assign}
        disabled={saving || !tenant}
        className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg py-2 transition-all"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Asignar"}
      </button>
    </section>
  );
}

function CreatePersonModal({
  tree,
  users,
  onClose,
  onDone,
  showToast,
}: {
  tree: TenantTree;
  users: AdminUser[];
  onClose: () => void;
  onDone: () => void;
  showToast: ToastFn;
}) {
  const [tenantId, setTenantId] = useState(tree.tenants[0]?.id ?? "");
  const tenant = tree.tenants.find((item) => item.id === tenantId);
  if (!tenant) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-sm">
          <p className="text-sm text-surface-300">Primero creá una organización.</p>
          <button type="button" onClick={onClose} className="mt-4 text-xs text-brand-400">
            Cerrar
          </button>
        </div>
      </div>
    );
  }
  return (
    <AddMemberModal
      key={tenant.id}
      tenant={tenant}
      users={users}
      onClose={onClose}
      onDone={onDone}
      showToast={showToast}
      orgPicker={{ tenants: tree.tenants, value: tenantId, onChange: setTenantId }}
    />
  );
}
