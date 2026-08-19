interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "default" | "warning" | "danger" | "success";
}

const accentMap = {
  default: "text-white",
  warning: "text-yellow-400",
  danger: "text-red-400",
  success: "text-emerald-400",
};

export default function StatCard({ label, value, sub, accent = "default" }: Props) {
  return (
    <div className="bg-surface-800 border border-surface-700 rounded-xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-surface-500 font-medium">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accentMap[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}
