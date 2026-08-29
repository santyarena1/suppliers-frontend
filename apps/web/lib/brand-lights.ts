import type { BrandSignalLight } from "@/lib/api";

export const SIGNAL_LIGHTS: BrandSignalLight[] = ["GREEN", "YELLOW", "RED", "BLUE", "GRAY"];

export const SIGNAL_LIGHT_LABELS: Record<BrandSignalLight, string> = {
  GREEN: "Hay / empujar",
  YELLOW: "Poco / consultar",
  RED: "Sin stock",
  BLUE: "Próximo ingreso",
  GRAY: "Discontinuado",
};

export const SIGNAL_LIGHT_DOT: Record<BrandSignalLight, string> = {
  GREEN: "bg-emerald-400",
  YELLOW: "bg-amber-400",
  RED: "bg-red-500",
  BLUE: "bg-sky-400",
  GRAY: "bg-slate-400",
};

export const SIGNAL_LIGHT_CARD: Record<BrandSignalLight, string> = {
  GREEN: "border-emerald-500/40 bg-emerald-500/10",
  YELLOW: "border-amber-500/40 bg-amber-500/10",
  RED: "border-red-500/40 bg-red-500/10",
  BLUE: "border-sky-500/40 bg-sky-500/10",
  GRAY: "border-slate-500/40 bg-slate-500/10",
};
