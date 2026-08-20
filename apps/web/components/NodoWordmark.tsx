import Image from "next/image";

/**
 * El texto "Nodo" del isotipo real (recortado a píxel del archivo original y
 * repintado blanco — misma tipografía y curvas exactas, no una fuente
 * parecida). El original es oscuro, pensado para fondo claro; acá se usa la
 * versión blanca porque la app es de tema oscuro.
 */
export default function NodoWordmark({ className = "h-4" }: { className?: string }) {
  return (
    <Image
      src="/logo-text-white.png"
      alt="Nodo"
      width={624}
      height={273}
      className={`${className} w-auto object-contain`}
      unoptimized
      priority
    />
  );
}
