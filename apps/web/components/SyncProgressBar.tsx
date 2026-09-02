/**
 * Barra de progreso de sincronización. Si el backend ya reportó `expectedTotal`
 * se pinta determinada; si no (primer sync), una franja en loop más el conteo.
 */
import type { CatalogSyncRun } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("es-AR");
}

export default function SyncProgressBar({ run }: { run?: CatalogSyncRun | null }) {
  const processed = run?.processed ?? 0;
  const expected = run?.expectedTotal ?? 0;
  const hasDenom = expected > 0;
  const running = run?.status === "RUNNING";
  const pct = hasDenom
    ? Math.min(running ? 99 : 100, Math.round((processed / Math.max(expected, 1)) * 100))
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
        {pct != null ? (
          <div
            className="h-full bg-brand-500 rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <>
            <div className="h-full w-1/3 bg-brand-500 rounded-full animate-[sync-bar_1.1s_ease-in-out_infinite]" />
            <style>{`
              @keyframes sync-bar {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
              }
            `}</style>
          </>
        )}
      </div>
      {run ? (
        <p className="text-[11px] text-surface-400 tabular-nums">
          {fmt(processed)}
          {hasDenom ? ` de ${fmt(expected)}` : ""} productos
          {" · "}
          {fmt(run.created)} nuevos
          {" · "}
          {fmt(run.updated)} actualizados
          {run.unchanged > 0 ? ` · ${fmt(run.unchanged)} sin cambios` : ""}
        </p>
      ) : null}
    </div>
  );
}
