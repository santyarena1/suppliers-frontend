"use client";

import { Check, Minus } from "lucide-react";
import { PLAN_CATALOG, PLAN_FEATURE_GROUPS, type PlanCell, type TenantPlan } from "@/lib/plans";

const PLANS: TenantPlan[] = ["BASE", "PRO", "CUSTOM"];

function Cell({ value }: { value: PlanCell }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-emerald-400" aria-label="Incluido" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-surface-600" aria-label="No incluido" />;
  return <span className="text-xs text-surface-200">{value}</span>;
}

/** Comparador de planes agrupado por capacidad. Lo usan la landing y Plan y facturación. */
export default function PlanComparison({ current, highlight = "PRO" }: { current?: TenantPlan | null; highlight?: TenantPlan }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-800">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-surface-800 bg-surface-900/60">
            <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-surface-400">Funciones</th>
            {PLANS.map((plan) => (
              <th
                key={plan}
                className={`px-3 py-3 text-center text-xs font-semibold ${plan === highlight ? "text-brand-300" : "text-white"}`}
              >
                {PLAN_CATALOG[plan].label}
                {current === plan && <span className="ml-1 text-[10px] font-normal text-surface-400">(tu plan)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_FEATURE_GROUPS.map((group) => (
            <GroupRows key={group.title} group={group} highlight={highlight} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, highlight }: { group: (typeof PLAN_FEATURE_GROUPS)[number]; highlight: TenantPlan }) {
  return (
    <>
      <tr className="bg-surface-900/30">
        <td colSpan={4} className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-surface-400">
          {group.title}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-b border-surface-800/60 last:border-0">
          <td className="px-4 py-2.5 text-surface-200">{row.label}</td>
          {PLANS.map((plan) => (
            <td key={plan} className={`px-3 py-2.5 text-center ${plan === highlight ? "bg-brand-500/5" : ""}`}>
              <Cell value={row.values[plan]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
