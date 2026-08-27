"use client";

import { useMemo, useState } from "react";
import SearchablePick from "./SearchablePick";
import type { LabelChoice } from "@/lib/catalog-menu";
import { Check, Loader2, X } from "lucide-react";

export type MenuTarget = {
  label: string;
  count: number;
  termId?: string | null;
  items: { provider: string; rawKey: string }[];
};

export default function SendToMenuDialog({
  target,
  parentChoices,
  parentCounts,
  busy,
  onClose,
  onConfirm,
}: {
  target: MenuTarget;
  parentChoices: LabelChoice[];
  parentCounts: Record<string, number>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (role: "parent" | "child", parentLabel: string | null) => Promise<void>;
}) {
  const [role, setRole] = useState<"parent" | "child">("parent");
  const [parentLabel, setParentLabel] = useState("");

  const parentCount = useMemo(() => {
    const hit = parentChoices.find((p) => p.label.toLowerCase() === parentLabel.trim().toLowerCase());
    if (hit) return hit.count;
    return parentCounts[parentLabel] ?? 0;
  }, [parentChoices, parentCounts, parentLabel]);

  const afterParent = parentCount + target.count;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-surface-700 bg-surface-950 shadow-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Mandar al menú</h3>
            <p className="text-sm text-surface-300 mt-1">
              «{target.label}» · <span className="tabular-nums">{target.count}</span> productos ahora
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm text-surface-200">
            <input
              type="radio"
              name="menu-role"
              checked={role === "parent"}
              onChange={() => setRole("parent")}
              className="mt-1"
            />
            <span>
              Como <strong className="text-white">padre</strong> (arriba del todo)
              <span className="block text-[11px] text-surface-500">
                Queda con {target.count} productos. Después le podés colgar hijas.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-surface-200">
            <input
              type="radio"
              name="menu-role"
              checked={role === "child"}
              onChange={() => setRole("child")}
              className="mt-1"
            />
            <span>
              Como <strong className="text-white">hija</strong> de un padre
            </span>
          </label>
        </div>

        {role === "child" && (
          <div className="space-y-2 pl-6">
            <SearchablePick
              value={parentLabel}
              options={parentChoices}
              onChange={setParentLabel}
              placeholder="Buscar padre o escribir uno nuevo…"
            />
            {parentLabel.trim() && (
              <p className="text-xs text-surface-400 leading-relaxed">
                Padre «{parentLabel.trim()}»: <span className="tabular-nums text-surface-200">{parentCount}</span>{" "}
                prod. ahora → <span className="tabular-nums text-white">{afterParent}</span> con esta hija.
                «{target.label}» sigue con {target.count}.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg border border-surface-700 text-surface-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || (role === "child" && !parentLabel.trim())}
            onClick={() => void onConfirm(role, role === "child" ? parentLabel.trim() : null)}
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Mandar al menú
          </button>
        </div>
      </div>
    </div>
  );
}
