/** Fecha/hora de última actualización del producto en catálogo. */
export default function ProductSyncedAt({
  syncedAt,
  className,
  compact = false,
}: {
  syncedAt?: string | null;
  className?: string;
  /** En la tarjeta: 24h, sin “a. m.”, para que entre en dos columnas. */
  compact?: boolean;
}) {
  if (!syncedAt) return null;
  const d = new Date(syncedAt);
  if (Number.isNaN(d.getTime())) return null;
  const label = compact
    ? d.toLocaleString("es-AR", {
        day: "numeric",
        month: "numeric",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
    : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  return (
    <p className={className ?? "text-[10px] text-surface-500"} title={`Última actualización: ${label}`}>
      Actualizado {label}
    </p>
  );
}
