"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import {
  brandApi,
  type BrandAccounts,
  type BrandAction,
  type BrandActionKind,
  type BrandActionRewardKind,
  type UpsertBrandAction,
} from "@/lib/api";
import { Loader2, Plus, Target } from "lucide-react";

const KIND_LABEL: Record<BrandActionKind, string> = {
  PURCHASE_QTY: "Unidades",
  PURCHASE_AMOUNT: "Compra en USD",
  REBATE: "Rebate por unidades",
};

const STATUS_LABEL: Record<BrandAction["status"], string> = {
  DRAFT: "Borrador",
  ACTIVE: "Activa",
  ENDED: "Finalizada",
  CANCELLED: "Cancelada",
};

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function toLocal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm(): UpsertBrandAction {
  const start = new Date();
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return {
    kind: "PURCHASE_QTY",
    title: "",
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    targetQty: 100,
    targetAmountUsd: null,
    rewardKind: "NONE",
    rewardUsd: null,
    notifyRetailers: true,
    scopes: [],
  };
}

export default function BrandActionsPage() {
  const [actions, setActions] = useState<BrandAction[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [accounts, setAccounts] = useState<BrandAccounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<UpsertBrandAction>(emptyForm());

  const load = useCallback(async () => {
    const [actionsRes, accountsRes] = await Promise.all([brandApi.actions(), brandApi.accounts()]);
    setActions(actionsRes.data.actions);
    setCanWrite(actionsRes.data.canWrite);
    setAccounts(accountsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudieron cargar las acciones") });
      setLoading(false);
    });
  }, [load]);

  const selectedDistros = useMemo(
    () => new Set(form.scopes.filter((s) => s.kind === "DISTRIBUTOR").map((s) => s.refId)),
    [form.scopes]
  );
  const selectedRetailers = useMemo(
    () => new Set(form.scopes.filter((s) => s.kind === "RETAILER").map((s) => s.refId)),
    [form.scopes]
  );

  function toggleScope(kind: "DISTRIBUTOR" | "RETAILER", refId: string) {
    setForm((prev) => {
      const has = prev.scopes.some((s) => s.kind === kind && s.refId === refId);
      return {
        ...prev,
        scopes: has
          ? prev.scopes.filter((s) => !(s.kind === kind && s.refId === refId))
          : [...prev.scopes, { kind, refId }],
      };
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(action: BrandAction) {
    setEditingId(action.id);
    setForm({
      kind: action.kind,
      title: action.title,
      description: action.description,
      startsAt: action.startsAt,
      endsAt: action.endsAt,
      targetQty: action.targetQty,
      targetAmountUsd: action.targetAmountUsd,
      rewardKind: action.rewardKind,
      rewardUsd: action.rewardUsd,
      notifyRetailers: action.notifyRetailers,
      scopes: action.scopes,
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload: UpsertBrandAction = {
        ...form,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        targetQty: form.kind === "PURCHASE_AMOUNT" ? null : Number(form.targetQty) || null,
        targetAmountUsd: form.kind === "PURCHASE_AMOUNT" ? Number(form.targetAmountUsd) || null : null,
        rewardUsd: form.rewardKind === "NONE" ? null : Number(form.rewardUsd) || null,
      };
      if (editingId) await brandApi.updateAction(editingId, payload);
      else await brandApi.createAction(payload);
      setShowForm(false);
      setAviso({ ok: true, text: "Acción guardada" });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo guardar") });
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: "ACTIVE" | "ENDED" | "CANCELLED") {
    try {
      await brandApi.setActionStatus(id, status);
      setAviso({
        ok: true,
        text: status === "ACTIVE" ? "Acción activada. Los comercios en alcance reciben un aviso." : "Estado actualizado",
      });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo cambiar el estado") });
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Acciones de marca</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Objetivos medibles sobre pedidos reales. Si un ítem no trae marca, no se cuenta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg px-3 py-2"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva acción
            </button>
          )}
          <PrefsPanel />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              {showForm && (
                <section className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-white">{editingId ? "Editar acción" : "Nueva acción"}</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Título">
                      <input
                        className={inputClass}
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="Comprá 50 notebooks ASUS en Elit"
                      />
                    </Field>
                    <Field label="Tipo">
                      <select
                        className={inputClass}
                        value={form.kind}
                        onChange={(e) => {
                          const kind = e.target.value as BrandActionKind;
                          setForm({
                            ...form,
                            kind,
                            targetQty: kind === "PURCHASE_AMOUNT" ? null : form.targetQty ?? 100,
                            targetAmountUsd: kind === "PURCHASE_AMOUNT" ? form.targetAmountUsd ?? 1000 : null,
                          });
                        }}
                      >
                        {Object.entries(KIND_LABEL).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Desde">
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={toLocal(form.startsAt)}
                        onChange={(e) => setForm({ ...form, startsAt: new Date(e.target.value).toISOString() })}
                      />
                    </Field>
                    <Field label="Hasta">
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={toLocal(form.endsAt)}
                        onChange={(e) => setForm({ ...form, endsAt: new Date(e.target.value).toISOString() })}
                      />
                    </Field>
                    {form.kind === "PURCHASE_AMOUNT" ? (
                      <Field label="Objetivo (USD)">
                        <input
                          type="number"
                          min={1}
                          className={inputClass}
                          value={form.targetAmountUsd ?? ""}
                          onChange={(e) => setForm({ ...form, targetAmountUsd: Number(e.target.value) })}
                        />
                      </Field>
                    ) : (
                      <Field label="Objetivo (unidades)">
                        <input
                          type="number"
                          min={1}
                          className={inputClass}
                          value={form.targetQty ?? ""}
                          onChange={(e) => setForm({ ...form, targetQty: Number(e.target.value) })}
                        />
                      </Field>
                    )}
                    <Field label="Rebate">
                      <div className="flex gap-2">
                        <select
                          className={inputClass}
                          value={form.rewardKind ?? "NONE"}
                          onChange={(e) => setForm({ ...form, rewardKind: e.target.value as BrandActionRewardKind })}
                        >
                          <option value="NONE">Sin rebate</option>
                          <option value="FLAT">Monto fijo USD</option>
                          <option value="PER_UNIT">USD por unidad</option>
                        </select>
                        {form.rewardKind !== "NONE" && (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className={inputClass}
                            placeholder="3"
                            value={form.rewardUsd ?? ""}
                            onChange={(e) => setForm({ ...form, rewardUsd: Number(e.target.value) })}
                          />
                        )}
                      </div>
                    </Field>
                  </div>
                  <Field label="Descripción">
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={form.description ?? ""}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Condiciones, productos, cómo se acredita el rebate."
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-xs text-surface-300">
                    <input
                      type="checkbox"
                      checked={form.notifyRetailers}
                      onChange={(e) => setForm({ ...form, notifyRetailers: e.target.checked })}
                    />
                    Avisar a los comercios al activarla
                  </label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Distribuidores (vacío = todos los vinculados)">
                      <ScopeList
                        items={(accounts?.distributors ?? []).map((d) => ({ id: d.id, name: d.name }))}
                        selected={selectedDistros}
                        onToggle={(id) => toggleScope("DISTRIBUTOR", id)}
                        empty="No hay distribuidores en la plataforma"
                      />
                    </Field>
                    <Field label="Comercios (vacío = todos los vinculados)">
                      <ScopeList
                        items={(accounts?.retailers ?? []).map((r) => ({ id: r.tenantId, name: r.name }))}
                        selected={selectedRetailers}
                        onToggle={(id) => toggleScope("RETAILER", id)}
                        empty="Todavía no hay comercios vinculados. Generá un código."
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-2"
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                    <button onClick={() => setShowForm(false)} className="text-xs text-surface-400 px-3 py-2">
                      Cancelar
                    </button>
                  </div>
                </section>
              )}

              {actions.length === 0 && !showForm ? (
                <div className="text-center py-16">
                  <Target className="w-10 h-10 text-surface-600 mx-auto mb-3" />
                  <p className="text-sm text-white font-medium">Todavía no hay acciones</p>
                  <p className="text-xs text-surface-500 mt-1 max-w-sm mx-auto">
                    Ejemplo: comprar 80 unidades en dos distribuidores, para cinco comercios, con rebate de 3 USD del 1 al 31.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {actions.map((action) => (
                    <article key={action.id} className="border border-surface-800 rounded-xl p-4 bg-surface-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{action.title}</p>
                          <p className="text-[11px] text-surface-500 mt-0.5">
                            {KIND_LABEL[action.kind]} · {STATUS_LABEL[action.status]} ·{" "}
                            {new Date(action.startsAt).toLocaleDateString("es-AR")} – {new Date(action.endsAt).toLocaleDateString("es-AR")}
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded ${
                          action.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-400" :
                          action.status === "DRAFT" ? "bg-surface-800 text-surface-400" :
                          "bg-surface-800 text-surface-500"
                        }`}>
                          {STATUS_LABEL[action.status]}
                        </span>
                      </div>
                      {action.description && <p className="text-xs text-surface-400 mt-2">{action.description}</p>}
                      <div className="mt-3">
                        <div className="flex justify-between text-[11px] text-surface-500 mb-1">
                          <span>Progreso</span>
                          <span className="tabular-nums">
                            {action.kind === "PURCHASE_AMOUNT"
                              ? `${action.progress.current.toFixed(0)} / ${action.progress.target ?? "—"} USD`
                              : `${action.progress.current} / ${action.progress.target ?? "—"} u.`}
                            {action.progress.met ? " · cumplido" : ""}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
                          <div
                            className={`h-full ${action.progress.met ? "bg-emerald-500" : "bg-brand-500"}`}
                            style={{ width: `${Math.round(action.progress.ratio * 100)}%` }}
                          />
                        </div>
                      </div>
                      {canWrite && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button onClick={() => openEdit(action)} className="text-[11px] text-brand-400 hover:text-brand-300">
                            Editar
                          </button>
                          {action.status === "DRAFT" && (
                            <button onClick={() => setStatus(action.id, "ACTIVE")} className="text-[11px] text-emerald-400">
                              Activar
                            </button>
                          )}
                          {action.status === "ACTIVE" && (
                            <button onClick={() => setStatus(action.id, "ENDED")} className="text-[11px] text-surface-400">
                              Finalizar
                            </button>
                          )}
                          {(action.status === "DRAFT" || action.status === "ACTIVE") && (
                            <button onClick={() => setStatus(action.id, "CANCELLED")} className="text-[11px] text-red-400">
                              Cancelar
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-surface-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ScopeList({
  items,
  selected,
  onToggle,
  empty,
}: {
  items: { id: string; name: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) return <p className="text-xs text-surface-500">{empty}</p>;
  return (
    <div className="max-h-40 overflow-y-auto border border-surface-800 rounded-md divide-y divide-surface-800">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-surface-300 hover:bg-surface-800/60">
          <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
          <span className="truncate">{item.name}</span>
        </label>
      ))}
    </div>
  );
}
