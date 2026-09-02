/** Leyenda chica bajo fotos elegidas por Serper / Primera foto. */
export default function AiImageDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[10px] leading-snug text-slate-500 ${className}`.trim()}>
      Imagen sugerida por IA; puede diferir del producto real.
    </p>
  );
}
