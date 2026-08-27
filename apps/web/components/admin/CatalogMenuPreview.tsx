"use client";

import { catalogEnrichmentApi, type CatalogTerm } from "@/lib/api";
import { buildMenuTree, subtreeCount, type MenuNode } from "@/lib/catalog-menu";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";

export default function CatalogMenuPreview({
  terms,
  counts,
  busy,
  onChanged,
  showToast,
}: {
  terms: CatalogTerm[];
  counts: Record<string, number>;
  busy: string | null;
  onChanged: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const tree = useMemo(() => buildMenuTree(terms, counts), [terms, counts]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  async function removeFromMenu(id: string) {
    try {
      await catalogEnrichmentApi.updateTerm(id, { inMenu: false, parentId: null });
      showToast("Sacada del menú");
      await onChanged();
    } catch {
      showToast("No se pudo sacar", false);
    }
  }

  if (tree.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-surface-700 px-4 py-6 text-sm text-surface-500">
        El menú está vacío. Desde la lista de categorías (unificadas o no), tocá{" "}
        <strong className="text-surface-300">Al menú</strong> y elegí si va como padre o como hija.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-surface-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-surface-800 bg-surface-900/60">
        <h3 className="text-sm font-medium text-white">Menú</h3>
        <p className="text-[11px] text-surface-500">Lo que va a verse anidado. Los números son productos.</p>
      </div>
      <ul className="divide-y divide-surface-800/70">
        {tree.map((n) => (
          <MenuRow
            key={n.id}
            node={n}
            depth={0}
            open={open}
            busy={busy}
            onToggle={(id) =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onRemove={removeFromMenu}
          />
        ))}
      </ul>
    </section>
  );
}

function MenuRow({
  node,
  depth,
  open,
  busy,
  onToggle,
  onRemove,
}: {
  node: MenuNode;
  depth: number;
  open: Set<string>;
  busy: string | null;
  onToggle: (id: string) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const isOpen = open.has(node.id) || depth === 0;
  const total = subtreeCount(node);
  return (
    <li>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-surface-900/40"
        style={{ paddingLeft: 12 + depth * 18 }}
      >
        {node.kids.length > 0 ? (
          <button type="button" onClick={() => onToggle(node.id)} className="text-surface-500">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <span className="text-sm text-white font-medium">{node.label}</span>
        <span className="text-[11px] text-surface-500 tabular-nums">
          {node.productCount} prod.
          {node.kids.length > 0 ? ` · ${total} con hijas` : ""}
        </span>
        <button
          type="button"
          disabled={busy?.startsWith("menu-") ?? false}
          onClick={() => void onRemove(node.id)}
          className="ml-auto p-1 text-surface-500 hover:text-white"
          title="Sacar del menú"
        >
          {busy === `menu-${node.id}` ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {isOpen &&
        node.kids.map((k) => (
          <ul key={k.id}>
            <MenuRow
              node={k}
              depth={depth + 1}
              open={open}
              busy={busy}
              onToggle={onToggle}
              onRemove={onRemove}
            />
          </ul>
        ))}
    </li>
  );
}
