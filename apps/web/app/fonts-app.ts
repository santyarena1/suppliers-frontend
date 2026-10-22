import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Letra de la app (no de la landing, que trae Archivo y Chivo Mono en su propio
 * layout): Inter para el texto y JetBrains Mono para precios y códigos. Usan las
 * mismas variables que la landing, así nodo-system.css y nodo-product.css las toman
 * sin cambios; la landing las pisa en su contenedor.
 */
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--lnd-font-display",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--lnd-font-mono",
});
