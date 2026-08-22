"use client";

import {
  Cpu, Monitor, HardDrive, Smartphone, Mouse, Gamepad2,
  Wifi, Battery, BarChart3, Package,
} from "lucide-react";
import type { CategoryCount } from "@/lib/api";

const ICONS: Record<string, React.ElementType> = {
  procesador: Cpu,
  placa: Monitor,
  video: Monitor,
  memoria: BarChart3,
  ram: BarChart3,
  disco: HardDrive,
  ssd: HardDrive,
  notebook: Smartphone,
  monitor: Monitor,
  periferico: Mouse,
  gaming: Gamepad2,
  router: Wifi,
  ups: Battery,
};

function iconFor(category: string) {
  const lower = category.toLowerCase();
  for (const [key, Icon] of Object.entries(ICONS)) {
    if (lower.includes(key)) return Icon;
  }
  return Package;
}

export default function CategoryStrip({
  categories,
  onSelect,
}: {
  categories: CategoryCount[];
  onSelect: (category: string) => void;
}) {
  if (categories.length === 0) return null;

  const top = categories.slice(0, 10);

  return (
    <section className="mb-8 -mx-4 sm:mx-0">
      <div className="bg-slate-900 border-y sm:border border-slate-800 sm:rounded-2xl px-4 sm:px-6 py-5">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
          Categorías populares
        </h2>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-1">
          {top.map((c) => {
            const Icon = iconFor(c.category);
            return (
              <button
                key={c.category}
                type="button"
                onClick={() => onSelect(c.category)}
                className="flex flex-col items-center gap-2 min-w-[72px] sm:min-w-[80px] group"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:border-brand-500 group-hover:bg-brand-600/20 transition-all">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 group-hover:text-brand-400 transition-colors" strokeWidth={1.5} />
                </div>
                <span className="text-[10px] sm:text-xs text-slate-400 group-hover:text-slate-100 font-medium text-center leading-tight max-w-[80px] truncate">
                  {c.category}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
