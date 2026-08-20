/**
 * Barra de progreso indeterminada para la sincronización: el backend hace
 * un solo request bloqueante y no reporta avance real página a página, así
 * que en vez de inventar un porcentaje se anima una franja en loop — indica
 * "está corriendo" sin fingir precisión que no existe.
 */
export default function SyncProgressBar() {
  return (
    <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
      <div className="h-full w-1/3 bg-brand-500 rounded-full animate-[sync-bar_1.1s_ease-in-out_infinite]" />
      <style>{`
        @keyframes sync-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
