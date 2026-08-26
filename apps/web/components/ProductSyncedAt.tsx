/** Fecha/hora de última actualización del producto en catálogo. */
export default function ProductSyncedAt({
  syncedAt,
  className,
}: {
  syncedAt?: string | null;
  className?: string;
}) {
  if (!syncedAt) return null;
  const d = new Date(syncedAt);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  return (
    <p className={className ?? "text-[10px] text-surface-500"} title={`Última actualización: ${label}`}>
      Actualizado {label}
    </p>
  );
}
