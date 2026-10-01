"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import api, { type ListFreshness, type Provider } from "@/lib/api";
import { invalidateListFreshness } from "@/lib/listFreshness";

const PRESETS = [7, 15, 30];

type Props = {
  provider: Provider;
  current: number | null;
  onSaved: () => void;
};

/**
 * Vigencia de la lista: cada cuántos días se espera una nueva. Vencida, avisa.
 * El comercio la fija para su lista propia; el proveedor, para su lista base.
 */
export default function ListCadenceEditor({ provider, current, onSaved }: Props) {
  const [value, setValue] = useState(current ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(current ? String(current) : "");
  }, [current]);

  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 365);
  const unchanged = parsed === (current ?? null);

  async function save() {
    if (invalid || unchanged) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.put<ListFreshness>(`/providers/${provider}/list-cadence`, { listUpdateDays: parsed });
      invalidateListFreshness(provider);
      setSaved(true);
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo guardar la vigencia");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <label htmlFor={`cadence-${provider}`} className="opacity-90">
        Vigencia: una lista nueva cada
      </label>
      <input
        id={`cadence-${provider}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={365}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="—"
        className={`w-16 bg-surface-900 border rounded-md px-2 py-1 text-surface-100 tabular-nums focus:outline-none focus:border-brand-500 ${
          invalid ? "border-red-500/60" : "border-surface-700"
        }`}
      />
      <span className="opacity-90">días</span>
      <span className="flex gap-1">
        {PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => {
              setValue(String(days));
              setSaved(false);
            }}
            className={`px-1.5 py-0.5 rounded border ${
              parsed === days ? "border-brand-500 text-brand-300" : "border-surface-700 text-surface-400 hover:text-surface-200"
            }`}
          >
            {days}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setValue("");
            setSaved(false);
          }}
          className={`px-1.5 py-0.5 rounded border ${
            parsed === null ? "border-brand-500 text-brand-300" : "border-surface-700 text-surface-400 hover:text-surface-200"
          }`}
        >
          Sin vigencia
        </button>
      </span>
      <button
        type="submit"
        disabled={saving || invalid || unchanged}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-600 text-white font-medium disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : null}
        Guardar
      </button>
      {invalid && <span className="text-red-400">Entre 1 y 365 días</span>}
      {error && <span className="text-red-400">{error}</span>}
    </form>
  );
}
