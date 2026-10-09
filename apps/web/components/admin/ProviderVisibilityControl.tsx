"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { tenantsApi, type ProviderDisplay } from "@/lib/api";

type Mode = "visible" | "some" | "hidden";

const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: "visible", label: "Visible", hint: "Lo ven todos los comercios." },
  { mode: "some", label: "Algunas orgs", hint: "Solo lo ven las organizaciones que elijas." },
  { mode: "hidden", label: "Oculto", hint: "No lo ve ningún comercio. Vos lo seguís viendo en Administración." },
];

interface Org {
  id: string;
  name: string;
}

/** Las organizaciones se cargan una vez para todos los distribuidores del panel. */
let orgsPromise: Promise<Org[]> | null = null;
function loadOrgs(): Promise<Org[]> {
  orgsPromise ??= tenantsApi
    .tree()
    .then((r) =>
      r.data.tenants
        .filter((t) => t.type === "RETAILER" && t.active)
        .map((t) => ({ id: t.id, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
    )
    .catch((err) => {
      orgsPromise = null;
      throw err;
    });
  return orgsPromise;
}

function modeOf(row: ProviderDisplay): Mode {
  if (row.visible) return "visible";
  return (row.allowedTenantIds ?? []).length > 0 ? "some" : "hidden";
}

/**
 * Visibilidad de un distribuidor para los comercios: visible, oculto para todos o
 * solo para algunas organizaciones.
 */
export default function ProviderVisibilityControl({
  row,
  onChange,
}: {
  row: ProviderDisplay;
  onChange: (patch: Partial<ProviderDisplay>) => void;
}) {
  const allowed = useMemo(() => row.allowedTenantIds ?? [], [row.allowedTenantIds]);
  const [picking, setPicking] = useState(false);
  const mode: Mode = picking && !row.visible ? "some" : modeOf(row);
  const current = MODES.find((m) => m.mode === mode)!;

  function pick(next: Mode) {
    if (next === "visible") {
      setPicking(false);
      onChange({ visible: true, allowedTenantIds: [] });
    } else if (next === "hidden") {
      setPicking(false);
      onChange({ visible: false, allowedTenantIds: [] });
    } else {
      setPicking(true);
      if (row.visible) onChange({ visible: false });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Visibilidad" className="flex gap-1 rounded-lg bg-surface-900 p-1">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={mode === m.mode}
              onClick={() => pick(m.mode)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === m.mode
                  ? m.mode === "visible"
                    ? "bg-emerald-600 text-white"
                    : m.mode === "some"
                      ? "bg-brand-600 text-white"
                      : "bg-red-600/80 text-white"
                  : "text-surface-400 hover:text-white"
              }`}
            >
              {m.label}
              {m.mode === "some" && allowed.length > 0 ? ` · ${allowed.length}` : ""}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-surface-500">{current.hint}</span>
      </div>
      {mode === "some" && (
        <OrgPicker
          selected={allowed}
          onChange={(ids) => onChange({ visible: false, allowedTenantIds: ids })}
        />
      )}
    </div>
  );
}

function OrgPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    loadOrgs()
      .then((list) => alive && setOrgs(list))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map((orgs ?? []).map((o) => [o.id, o])), [orgs]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!orgs || !q) return [];
    return orgs.filter((o) => !selected.includes(o.id) && o.name.toLowerCase().includes(q)).slice(0, 8);
  }, [orgs, query, selected]);

  if (error) return <p className="text-xs text-red-300">No se pudieron cargar las organizaciones.</p>;

  return (
    <div className="rounded-lg border border-surface-800 bg-surface-900/60 p-3 flex flex-col gap-2">
      {selected.length === 0 ? (
        <p className="text-[11px] text-amber-200/80">Sin organizaciones elegidas: por ahora no lo ve nadie.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-brand-500/15 border border-brand-500/25 pl-2 pr-1 py-0.5 text-xs text-brand-100">
              {byId.get(id)?.name ?? "Organización"}
              <button
                type="button"
                aria-label={`Quitar ${byId.get(id)?.name ?? "organización"}`}
                onClick={() => onChange(selected.filter((x) => x !== id))}
                className="rounded p-0.5 text-brand-200 hover:bg-brand-500/20 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={orgs ? "Buscar organización para habilitar…" : "Cargando organizaciones…"}
          disabled={!orgs}
          className="w-full h-8 rounded-md border border-surface-700 bg-surface-950 pl-8 pr-2 text-xs text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
        />
      </div>
      {matches.length > 0 && (
        <ul className="flex flex-col">
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...selected, o.id]);
                  setQuery("");
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-surface-200 hover:bg-surface-800 hover:text-white"
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
