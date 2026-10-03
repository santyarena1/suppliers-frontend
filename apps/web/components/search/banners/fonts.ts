import { Rajdhani, Space_Grotesk } from "next/font/google";

/**
 * Caras de los mosaicos demo del buscador. Rajdhani para los de marca (corte
 * técnico, cercano a la tipografía de ROG/AORUS); Space Grotesk para los de
 * categoría. Inter ya viene global desde globals.css.
 */
export const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--bn-font-brand",
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--bn-font-category",
});
