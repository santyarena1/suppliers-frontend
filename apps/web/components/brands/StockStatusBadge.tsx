import { STOCK_STATUS_COLORS, STOCK_STATUS_LABELS, type StockStatus } from "@/lib/brands/constants";

interface Props {
  status: StockStatus;
  size?: "sm" | "md";
}

export default function StockStatusBadge({ status, size = "sm" }: Props) {
  const colors = STOCK_STATUS_COLORS[status] ?? STOCK_STATUS_COLORS.CONSULT;
  const label = STOCK_STATUS_LABELS[status] ?? status;
  const sizeClass = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  return (
    <span className={`inline-flex items-center rounded border font-medium whitespace-nowrap ${colors} ${sizeClass}`}>
      {label}
    </span>
  );
}
