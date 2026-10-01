import DataField from "@/components/landing/DataField";

/**
 * El campo de partículas de NODO como fondo de toda la landing: fijo detrás
 * del contenido, un solo canvas. Un velo suave mantiene el texto legible.
 */
export function PageField() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <DataField landRows={false} />
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,rgb(11_13_26/0.55),rgb(11_13_26/0.2)_70%,transparent)]" />
      {/* En el celular el texto ocupa todo el ancho: el campo va más tenue para que se lea. */}
      <div className="absolute inset-0 bg-[rgb(11_13_26/0.45)] sm:hidden" />
    </div>
  );
}
