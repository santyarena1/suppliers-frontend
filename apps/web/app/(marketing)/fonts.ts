import { Archivo, Chivo_Mono } from "next/font/google";

/**
 * Las dos caras se self-hostean con next/font: la letra de la marca no puede
 * pintarse con la sans del sistema mientras baja de un CDN. next/font además
 * precarga y genera un fallback ajustado por métricas, así no hay salto.
 *
 * Archivo trae el eje de ancho real (wdth), que es lo que permite condensar el
 * display de verdad en vez de falsearlo con scaleX. Las dos son de
 * Omnibus-Type, Buenos Aires.
 */
export const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--lnd-font-display",
});

export const chivoMono = Chivo_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--lnd-font-mono",
});
