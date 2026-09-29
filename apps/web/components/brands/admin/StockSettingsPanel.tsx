"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Hand, Loader2, RefreshCw } from "lucide-react";
import type { BrandStockSettings } from "@/lib/api";
import { STOCK_STATUS_DOT } from "@/lib/brand-stock";

/** Cómo arma la marca su semáforo: automático por rangos o a mano, y qué se muestra. */
export function StockSettingsPanel({
  settings,
  canWrite,
  publicUrl,
  onSave,
}: {
  settings: BrandStockSettings;
  canWrite: boolean;
  /** Link público de la landing, si está publicada. */
  publicUrl: string | null;
  onSave: (patch: Partial<BrandStockSettings>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const rangesOk = Number.isInteger(draft.lowBelow) && draft.lowBelow >= 1 && draft.highFrom > draft.lowBelow;

  async function save() {
    if (!dirty || !rangesOk) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Cómo se arma el semáforo</h2>
          <p className="text-xs text-surface-400 mt-0.5">Vale para todos tus productos y todos los distribuidores.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || !rangesOk || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-brand-500"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Guardar
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ModeOption
          active={draft.mode === "AUTO"}
          disabled={!canWrite}
          onClick={() => setDraft({ ...draft, mode: "AUTO" })}
          icon={<RefreshCw className="w-4 h-4" />}
          title="Automático"
          text="Sale del stock que NODO sincroniza de cada distribuidor, según tus rangos."
        />
        <ModeOption
          active={draft.mode === "MANUAL"}
          disabled={!canWrite}
          onClick={() => setDraft({ ...draft, mode: "MANUAL" })}
          icon={<Hand className="w-4 h-4" />}
          title="Manual"
          text="Vos elegís la luz de cada producto en cada distribuidor."
        />
      </div>

      {draft.mode === "AUTO" && (
        <div className="mt-4 rounded-xl border border-surface-800 bg-black/20 p-3">
          <p className="text-xs text-surface-300 mb-2.5">Rangos (unidades en stock del distribuidor)</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-surface-300">
            <Range dot={STOCK_STATUS_DOT.NONE}>0 = Sin stock</Range>
            <Range dot={STOCK_STATUS_DOT.LOW}>
              Bajo: menos de
              <NumberInput
                value={draft.lowBelow}
                disabled={!canWrite}
                onChange={(n) => setDraft({ ...draft, lowBelow: n })}
              />
            </Range>
            <Range dot={STOCK_STATUS_DOT.MEDIUM}>Medio: entre los dos</Range>
            <Range dot={STOCK_STATUS_DOT.HIGH}>
              Alto: desde
              <NumberInput
                value={draft.highFrom}
                disabled={!canWrite}
                onChange={(n) => setDraft({ ...draft, highFrom: n })}
              />
            </Range>
          </div>
          {!rangesOk && <p className="mt-2 text-[11px] text-red-400">Bajo arranca en 1 y Alto tiene que ser mayor que Bajo.</p>}
          <p className="mt-2 text-[11px] text-surface-500">
            Si un distribuidor no sincronizó en las últimas 48 h, se muestra “Sin dato”.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Toggle
          checked={draft.brandSeesExact}
          disabled={!canWrite || draft.mode === "MANUAL"}
          onChange={(v) => setDraft({ ...draft, brandSeesExact: v })}
          label="Ver las unidades exactas en este panel"
          hint="Solo lo ves vos. Los comercios y tu página pública siempre ven alto / medio / bajo."
        />
        <Toggle
          checked={draft.publicStock}
          disabled={!canWrite}
          onChange={(v) => setDraft({ ...draft, publicStock: v })}
          label="Mostrar el semáforo en mi página pública"
          hint="La ve cualquiera con el link, aunque no use NODO. Si lo apagás, muestra solo nombre e imagen de cada producto."
        />
      </div>

      {publicUrl && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-surface-700 px-3 py-2">
          <span className="text-[11px] uppercase tracking-wide text-surface-500">Compartir mi página</span>
          <code className="text-xs text-surface-200 truncate max-w-full">{publicUrl}</code>
          <button
            type="button"
            onClick={copyLink}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      )}
    </section>
  );
}

function ModeOption({
  active,
  disabled,
  onClick,
  icon,
  title,
  text,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`text-left rounded-xl border p-3 transition-colors disabled:cursor-default ${
        active ? "border-brand-500/70 bg-brand-500/10" : "border-surface-800 hover:border-surface-600"
      }`}
    >
      <span className={`inline-flex items-center gap-2 text-sm font-semibold ${active ? "text-white" : "text-surface-300"}`}>
        {icon}
        {title}
      </span>
      <span className="block text-[11px] text-surface-400 mt-1">{text}</span>
    </button>
  );
}

function Range({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function NumberInput({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      min={1}
      value={Number.isFinite(value) ? value : ""}
      disabled={disabled}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
      className="w-16 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-xs text-white tabular-nums"
    />
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="mt-0.5 accent-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-xs text-white">{label}</span>
        <span className="block text-[11px] text-surface-500">{hint}</span>
      </span>
    </label>
  );
}
