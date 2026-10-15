import type { Metadata } from "next";
import "./landing.css";
import { archivo, chivoMono } from "./fonts";

const TITLE = "NODO | Todos tus distribuidores en una sola búsqueda";
const DESCRIPTION =
  "Buscá una vez en todos tus distribuidores: stock y precio final con impuestos. Un carrito, un pedido por distribuidor, directo en su portal.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "NODO",
    locale: "es_AR",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og/og-nodo.jpg", width: 1200, height: 630, alt: "NODO: todos tus distribuidores en una sola búsqueda" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og/og-nodo.jpg"] },
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
