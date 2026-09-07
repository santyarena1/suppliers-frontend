import type { Metadata } from "next";
import "./landing.css";
import { archivo, chivoMono } from "./fonts";

export const metadata: Metadata = {
  title: "NODO — Todos tus distribuidores en una sola búsqueda",
  description:
    "NODO reúne el catálogo de todos tus distribuidores en una búsqueda, un carrito y un historial de pedidos. Precios con impuestos reales, stock al día y compra sin salir del sistema.",
};

/**
 * La landing no comparte el chrome de la app: layout propio, mundo propio.
 * El root layout sigue envolviendo (App Router), así que el fondo se pinta
 * opaco acá para que no se filtre el tema de la aplicación.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lnd min-h-screen ${archivo.variable} ${chivoMono.variable}`}>
      {/* Sin JS el revelado nunca se dispara: el contenido tiene que verse igual. */}
      <noscript>
        <style>{".lnd-reveal{opacity:1 !important;transform:none !important}"}</style>
      </noscript>
      {children}
    </div>
  );
}
