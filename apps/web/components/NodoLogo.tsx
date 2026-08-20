import Image from "next/image";

/**
 * Marca de NODO: el isotipo real (recortado a píxel del archivo que mandó el
 * cliente, fondo ya transparente en el original — no es una recreación).
 */
export default function NodoLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <Image
      src="/logo-icon.png"
      alt="NODO"
      width={262}
      height={260}
      className={`${className} object-contain`}
      unoptimized
      priority
    />
  );
}
