"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Lock, RotateCcw } from "lucide-react";
import {
  TENANT_ROLE_LABELS,
  type PermissionChanges,
  type PermissionDefinition,
  type PermissionKey,
  type PermissionMatrix,
  type PermissionMember,
  type TenantRole,
} from "@/lib/api";
import { invalidateMyModules } from "@/lib/permissions";

export interface PermissionsSource {
  load: () => Promise<PermissionMatrix>;
  saveRole: (role: TenantRole, changes: PermissionChanges) => Promise<PermissionMatrix>;
  saveMember: (membershipId: string, changes: PermissionChanges) => Promise<PermissionMatrix>;
}

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/** Valor que hereda un rol: su excepción si la hay, si no el defecto. */
function roleValue(matrix: PermissionMatrix, role: TenantRole, key: PermissionKey): boolean {
  if (role === "OWNER") return true;
  const override = matrix.roleOverrides[role]?.[key];
  return override ?? matrix.defaults[role]?.[key] ?? false;
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        on ? "bg-brand-600" : "bg-surface-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:brightness-110"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

/**
 * Qué puede hacer cada rol y cada persona. Filas = permisos, columnas = roles.
 * El dueño tiene todo y no se toca; una marca indica lo que difiere del defecto.
 */
export default function PermissionsMatrix({
  source,
  onMessage,
}: {
  source: PermissionsSource;
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<string | null>(null);

  useEffect(() => {
    source
      .load()
      .then((res) => setMatrix(res))
      .catch((err) => onMessage(false, errMsg(err, "No se pudieron cargar los permisos")));
  }, [source, onMessage]);

  const grouped = useMemo(() => {
    if (!matrix) return [];
    const byGroup = new Map<string, PermissionDefinition[]>();
    for (const permission of matrix.permissions) {
      byGroup.set(permission.group, [...(byGroup.get(permission.group) ?? []), permission]);
    }
    return [...byGroup.entries()].map(([group, items]) => ({ group, label: matrix.groups[group] ?? group, items }));
  }, [matrix]);

  const apply = useCallback(
    async (busyKey: string, run: () => Promise<PermissionMatrix>) => {
      setBusy(busyKey);
      try {
        const next = await run();
        // Quien pudo guardar puede seguir editando: si la respuesta no trae canEdit,
        // se conserva el de antes (antes quedaba todo bloqueado tras el primer cambio).
        setMatrix((prev) => ({ ...next, canEdit: next.canEdit ?? prev?.canEdit ?? true }));
        invalidateMyModules();
        onMessage(true, "Permisos actualizados");
      } catch (err) {
        onMessage(false, errMsg(err, "No se pudieron guardar los permisos"));
      } finally {
        setBusy(null);
      }
    },
    [onMessage]
  );

  if (!matrix) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  const editableRoles = matrix.roles.filter((role) => role !== "OWNER");

  function toggleRole(role: TenantRole, key: PermissionKey) {
    if (!matrix) return;
    const next = !roleValue(matrix, role, key);
    const isDefault = next === (matrix.defaults[role]?.[key] ?? false);
    void apply(`${role}:${key}`, () => source.saveRole(role, { [key]: isDefault ? null : next }));
  }

  function resetRole(role: TenantRole) {
    if (!matrix) return;
    const keys = Object.keys(matrix.roleOverrides[role] ?? {});
    if (keys.length === 0) return;
    void apply(`${role}:reset`, () => source.saveRole(role, Object.fromEntries(keys.map((key) => [key, null]))));
  }

  return (
    <div className="flex flex-col gap-5">
      {!matrix.canEdit && (
        <p className="flex items-center gap-2 text-[11px] text-surface-400 border border-surface-800 rounded-lg px-3 py-2">
          <Lock className="w-3.5 h-3.5 shrink-0" /> Solo el dueño de la organización puede cambiar permisos.
        </p>
      )}

      <div className="border border-surface-800 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm border-collapse">
          <thead>
            <tr className="bg-surface-900/70 text-[11px] text-surface-400">
              <th className="text-left font-medium px-3 py-2.5 sticky left-0 bg-surface-900 z-10">Permiso</th>
              {matrix.roles.map((role) => {
                const custom = Object.keys(matrix.roleOverrides[role] ?? {}).length;
                return (
                  <th key={role} className="px-2 py-2.5 font-medium text-center whitespace-nowrap">
                    <span className="block text-surface-200">{TENANT_ROLE_LABELS[role]}</span>
                    {role === "OWNER" ? (
                      <span className="text-[10px] text-surface-500">siempre todo</span>
                    ) : custom > 0 && matrix.canEdit ? (
                      <button
                        type="button"
                        onClick={() => resetRole(role)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200"
                        title="Volver a los valores por defecto del rol"
                      >
                        <RotateCcw className="w-3 h-3" /> {custom} cambio{custom === 1 ? "" : "s"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-surface-600">por defecto</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {grouped.map(({ group, label, items }) => (
            <tbody key={group} className="border-t border-surface-800">
              <tr>
                <td colSpan={matrix.roles.length + 1} className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
                  {label}
                </td>
              </tr>
              {items.map((permission) => (
                <tr key={permission.key} className="hover:bg-surface-900/40">
                  <td className="px-3 py-2 sticky left-0 bg-surface-950 z-10 align-top">
                    <p className="text-surface-100 text-[13px]">{permission.label}</p>
                    <p className="text-[11px] text-surface-500 leading-snug max-w-xs">{permission.description}</p>
                  </td>
                  {matrix.roles.map((role) => {
                    const on = roleValue(matrix, role, permission.key);
                    const custom = matrix.roleOverrides[role]?.[permission.key] !== undefined;
                    const cellBusy = busy === `${role}:${permission.key}`;
                    return (
                      <td key={role} className="px-2 py-2 text-center align-middle">
                        <span className="relative inline-flex items-center">
                          {cellBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                          ) : (
                            <Switch
                              on={on}
                              label={`${permission.label} · ${TENANT_ROLE_LABELS[role]}`}
                              disabled={role === "OWNER" || !matrix.canEdit || busy !== null}
                              onClick={() => toggleRole(role, permission.key)}
                            />
                          )}
                          {custom && (
                            <span className="absolute -right-2 -top-1 w-1.5 h-1.5 rounded-full bg-amber-400" title="Cambiado respecto del defecto" />
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {editableRoles.length > 0 && (
        <section className="flex flex-col gap-2">
          <div>
            <h3 className="text-xs font-semibold text-white">Excepciones por persona</h3>
            <p className="text-[11px] text-surface-500">
              Para alguien puntual que necesita más o menos que su rol. Lo demás lo hereda del rol.
            </p>
          </div>
          <div className="border border-surface-800 rounded-xl divide-y divide-surface-800">
            {matrix.members.map((member) => (
              <MemberRow
                key={member.membershipId}
                member={member}
                matrix={matrix}
                grouped={grouped}
                open={openMember === member.membershipId}
                busy={busy}
                onToggleOpen={() => setOpenMember((prev) => (prev === member.membershipId ? null : member.membershipId))}
                onChange={(changes) =>
                  apply(`member:${member.membershipId}`, () => source.saveMember(member.membershipId, changes))
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type Tri = "role" | "yes" | "no";

function MemberRow({
  member,
  matrix,
  grouped,
  open,
  busy,
  onToggleOpen,
  onChange,
}: {
  member: PermissionMember;
  matrix: PermissionMatrix;
  grouped: { group: string; label: string; items: PermissionDefinition[] }[];
  open: boolean;
  busy: string | null;
  onToggleOpen: () => void;
  onChange: (changes: PermissionChanges) => void;
}) {
  const isOwner = member.role === "OWNER";
  const exceptions = Object.keys(member.overrides).length;
  const saving = busy === `member:${member.membershipId}`;

  function stateOf(key: PermissionKey): Tri {
    const value = member.overrides[key];
    return value === undefined ? "role" : value ? "yes" : "no";
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggleOpen}
        disabled={isOwner}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-900/40 disabled:hover:bg-transparent"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-surface-100 truncate">{member.username}</span>
          <span className="block text-[11px] text-surface-500 truncate">
            {TENANT_ROLE_LABELS[member.role]}
            {member.title ? ` · ${member.title}` : ""}
          </span>
        </span>
        {isOwner ? (
          <span className="text-[10px] text-surface-500">tiene todo</span>
        ) : exceptions > 0 ? (
          <span className="text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-full px-2 py-0.5">
            {exceptions} excepción{exceptions === 1 ? "" : "es"}
          </span>
        ) : (
          <span className="text-[10px] text-surface-600">como su rol</span>
        )}
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
        ) : (
          !isOwner && <ChevronDown className={`w-3.5 h-3.5 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && !isOwner && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {grouped.map(({ group, label, items }) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1">{label}</p>
              <div className="flex flex-col gap-1">
                {items.map((permission) => {
                  const state = stateOf(permission.key);
                  const inherited = roleValue(matrix, member.role, permission.key);
                  const effective = member.effective.includes(permission.key);
                  return (
                    <div key={permission.key} className="flex flex-wrap items-center gap-2 justify-between">
                      <span className={`text-[12px] ${effective ? "text-surface-100" : "text-surface-500 line-through decoration-surface-600"}`}>
                        {permission.label}
                      </span>
                      <div className="inline-flex rounded-md border border-surface-700 overflow-hidden text-[11px]" role="radiogroup" aria-label={permission.label}>
                        {(
                          [
                            { value: "role" as const, text: `Según rol (${inherited ? "sí" : "no"})` },
                            { value: "yes" as const, text: "Sí" },
                            { value: "no" as const, text: "No" },
                          ]
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={state === option.value}
                            disabled={!matrix.canEdit || busy !== null}
                            onClick={() =>
                              onChange({ [permission.key]: option.value === "role" ? null : option.value === "yes" })
                            }
                            className={`px-2 py-1 transition-colors disabled:cursor-not-allowed ${
                              state === option.value
                                ? option.value === "role"
                                  ? "bg-surface-700 text-white"
                                  : "bg-brand-600/25 text-brand-200"
                                : "text-surface-400 hover:text-white hover:bg-surface-800"
                            }`}
                          >
                            {option.text}
                          </button>
                        ))}
                      </div>
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
