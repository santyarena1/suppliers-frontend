import type { Metadata } from "next";
import "./landing.css";
import { archivo, chivoMono } from "./fonts";

export const metadata: Metadata = {
  title: "NODO | Todos tus distribuidores en una sola búsqueda",
  description:
    "Buscá una vez en todos tus distribuidores: stock y precio final con impuestos. Un carrito, un pedido por distribuidor, directo en su portal.",
};

/**
 * La landing no comparte el chrome de la app: layout propio, mundo propio.
 * El root layout sigue envolviendo (App Router), así que el fondo se pinta
 * opaco acá para que no se filtre el tema de la aplicación.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lnd min-h-dvh ${archivo.variable} ${chivoMono.variable}`}>
      {/* Sin JS el revelado nunca se dispara: el contenido tiene que verse igual. */}
      <noscript>
        <style>{".lnd-reveal{opacity:1 !important;transform:none !important}"}</style>
      </noscript>
      {children}
    </div>
  );
}
