"use client";

import { useMemo, useState, useEffect } from "react";
import { catalogEnrichmentApi, type CatalogTerm } from "@/lib/api";
import { buildCategoryTree, descendantIds, type MenuNode } from "@/lib/catalog-menu";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderTree,
  Loader2,
  Plus,
  X,
} from "lucide-react";

export default function MenuNodoTab({
  terms,
  busy,
  setBusy,
  onChanged,
  showToast,
}: {
  terms: CatalogTerm[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  onChanged: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const tree = useMemo(() => buildCategoryTree(terms), [terms]);
  const [newParent, setNewParent] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOpenIds((prev) => {
      if (prev.size > 0) return prev;
      return new Set(tree.filter((n) => n.kids.length > 0).map((n) => n.id));
    });
  }, [tree]);

  const allCats = useMemo(
    () =>
      terms
        .filter((t) => t.kind === "CATEGORY" || t.kind === "SUBCATEGORY")
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [terms]
  );

  async function createParent() {
    const label = newParent.trim();
    if (!label) return;
    setBusy("menu-parent");
    try {
      await catalogEnrichmentApi.createTerm({ kind: "CATEGORY", label });
      setNewParent("");
      showToast(`Carpeta «${label}» creada`);
      await onChanged();
    } catch {
      showToast("No se pudo crear. ¿Ya existe ese nombre?", false);
    } finally {
      setBusy(null);
    }
  }

  async function createChild(parentId: string, label: string) {
    const name = label.trim();
    if (!name) return;
    setBusy(`child-${parentId}`);
    try {
      const existing =
        allCats.find((t) => t.kind === "CATEGORY" && t.label.toLowerCase() === name.toLowerCase()) ??
        allCats.find((t) => t.label.toLowerCase() === name.toLowerCase());
      if (existing) {
        await catalogEnrichmentApi.updateTerm(existing.id, { parentId });
        showToast(`«${existing.label}» ahora está dentro`);
      } else {
        await catalogEnrichmentApi.createTerm({ kind: "CATEGORY", label: name, parentId });
        showToast(`«${name}» creada adentro`);
      }
      await onChanged();
    } catch {
      showToast("No se pudo agregar", false);
    } finally {
      setBusy(null);
    }
  }

  async function adopt(parentId: string, childId: string) {
    if (!childId) return;
    setBusy(`adopt-${parentId}`);
    try {
      await catalogEnrichmentApi.updateTerm(childId, { parentId });
      showToast("Categoría metida en la carpeta");
      await onChanged();
    } catch {
      showToast("No se pudo mover", false);
    } finally {
      setBusy(null);
    }
  }

  async function detach(id: string) {
    setBusy(`det-${id}`);
    try {
      await catalogEnrichmentApi.updateTerm(id, { parentId: null });
      showToast("Quedó suelta, al nivel de arriba");
      await onChanged();
    } catch {
      showToast("No se pudo sacar", false);
    } finally {
      setBusy(null);
    }
  }

  async function toggleVis(t: CatalogTerm) {
    setBusy(`vis-${t.id}`);
    try {
      await catalogEnrichmentApi.updateTerm(t.id, { visible: !t.visible });
      await onChanged();
    } catch {
      showToast("Error de visibilidad", false);
    } finally {
      setBusy(null);
    }
  }

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-sm text-surface-400 leading-relaxed">
        Armá el menú de Nodo: carpetas (padres) con categorías adentro, como un menú con
        submenús. Podés crear una carpeta nueva y meterle categorías que ya existen, o crear la
        hija ahí mismo.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void createParent();
        }}
        className="rounded-xl border border-surface-800 bg-surface-900/40 px-4 py-3 flex flex-wrap gap-2 items-center"
      >
        <FolderTree className="w-4 h-4 text-brand-400" />
        <input
          value={newParent}
          onChange={(e) => setNewParent(e.target.value)}
          placeholder="Nueva carpeta / categoría padre…"
          className="flex-1 min-w-[200px] rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-2 text-sm text-white"
        />
        <button
          type="submit"
          disabled={busy === "menu-parent" || !newParent.trim()}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-50"
        >
          {busy === "menu-parent" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Crear padre
        </button>
      </form>

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        {tree.length === 0 ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center">
            Todavía no hay categorías. Unificá algunas o creá una carpeta arriba.
          </p>
        ) : (
          <ul className="divide-y divide-surface-800/70">
            {tree.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                openIds={openIds}
                allCats={allCats}
                busy={busy}
                onToggleOpen={toggleOpen}
                onCreateChild={createChild}
                onAdopt={adopt}
                onDetach={detach}
                onToggleVis={toggleVis}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  openIds,
  allCats,
  busy,
  onToggleOpen,
  onCreateChild,
  onAdopt,
  onDetach,
  onToggleVis,
}: {
  node: MenuNode;
  depth: number;
  openIds: Set<string>;
  allCats: CatalogTerm[];
  busy: string | null;
  onToggleOpen: (id: string) => void;
  onCreateChild: (parentId: string, label: string) => Promise<void>;
  onAdopt: (parentId: string, childId: string) => Promise<void>;
  onDetach: (id: string) => Promise<void>;
  onToggleVis: (t: CatalogTerm) => Promise<void>;
}) {
  const open = openIds.has(node.id);
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState("");
  const [adoptId, setAdoptId] = useState("");
  const blocked = descendantIds(node);
  const adoptable = allCats.filter((t) => !blocked.has(t.id) && t.parentId !== node.id);

  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-surface-900/40"
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        <button
          type="button"
          onClick={() => onToggleOpen(node.id)}
          className="p-0.5 text-surface-500"
          aria-label={open ? "Cerrar" : "Abrir"}
        >
          {node.kids.length > 0 ? (
            open ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <span className="inline-block w-4" />
          )}
        </button>
        <span className="text-sm font-medium text-white">{node.label}</span>
        {node.kids.length > 0 && (
          <span className="text-[11px] text-surface-500 tabular-nums">
            {node.kids.length} adentro
          </span>
        )}
        {node.parent && (
          <span className="text-[10px] text-surface-600">en {node.parent.label}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] px-2 py-1 rounded-lg border border-surface-700 text-surface-300 hover:text-white"
        >
          {adding ? "Cerrar" : "+ Hija"}
        </button>
        {node.parentId && (
          <button
            type="button"
            disabled={busy === `det-${node.id}`}
            onClick={() => void onDetach(node.id)}
            className="text-[11px] px-2 py-1 rounded-lg border border-surface-700 text-surface-400 hover:text-white"
          >
            Sacar
          </button>
        )}
        <button
          type="button"
          onClick={() => void onToggleVis(node)}
          className="p-1.5 rounded-lg border border-surface-700 text-surface-400"
          title={node.visible ? "Ocultar del catálogo" : "Mostrar"}
        >
          {node.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-amber-300" />}
        </button>
      </div>

      {adding && (
        <div
          className="pb-3 flex flex-wrap gap-2 items-center"
          style={{ paddingLeft: 36 + depth * 20 }}
        >
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Nombre nuevo o existente…"
            className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[180px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onCreateChild(node.id, childName).then(() => setChildName(""));
              }
            }}
          />
          <button
            type="button"
            disabled={busy === `child-${node.id}` || !childName.trim()}
            onClick={() => void onCreateChild(node.id, childName).then(() => setChildName(""))}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
          >
            {busy === `child-${node.id}` ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Crear / meter
          </button>
          {adoptable.length > 0 && (
            <>
              <span className="text-[11px] text-surface-500">o una que ya existe</span>
              <select
                value={adoptId}
                onChange={(e) => setAdoptId(e.target.value)}
                className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[160px]"
              >
                <option value="">Elegir categoría…</option>
                {adoptable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                    {t.parent ? ` (ahora en ${t.parent.label})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!adoptId || busy === `adopt-${node.id}`}
                onClick={() =>
                  void onAdopt(node.id, adoptId).then(() => {
                    setAdoptId("");
                  })
                }
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-brand-500/40 text-brand-300 disabled:opacity-50"
              >
                Adoptar
              </button>
            </>
          )}
          <button type="button" onClick={() => setAdding(false)} className="p-1 text-surface-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {open && node.kids.length > 0 && (
        <ul>
          {node.kids.map((kid) => (
            <TreeRow
              key={kid.id}
              node={kid}
              depth={depth + 1}
              openIds={openIds}
              allCats={allCats}
              busy={busy}
              onToggleOpen={onToggleOpen}
              onCreateChild={onCreateChild}
              onAdopt={onAdopt}
              onDetach={onDetach}
              onToggleVis={onToggleVis}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
