import { CategorySchema, GENERIC_ATTRIBUTES } from "./types";

export const PRINTER_SCHEMA: CategorySchema = {
  categoryKey: "printer",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "technology", label: "Tecnología", type: "enum", values: ["Inyección de tinta", "Láser", "Tinta continua", "Térmica", "Matriz de punto"], aliases: ["tecnologia de impresion", "print technology"] },
    { key: "color_printing", label: "Color", type: "bool", aliases: ["impresion a color", "colour printing"] },
    { key: "multifunction", label: "Multifunción", type: "bool", aliases: ["multifuncion", "all-in-one"] },
    { key: "ppm", label: "Páginas por minuto", type: "number", unit: "ppm", aliases: ["velocidad de impresion (negro, calidad normal, a4/us carta)", "print speed (black, normal quality, a4/us letter)"] },
    { key: "wifi", label: "Wi-Fi", type: "bool", aliases: ["wifi", "wi-fi"] },
    { key: "duplex", label: "Dúplex", type: "bool", aliases: ["impresion duplex", "duplex printing"] },
  ],
};
