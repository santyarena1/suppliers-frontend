import { CategorySchema, GENERIC_ATTRIBUTES } from "./types";

export const MOUSE_SCHEMA: CategorySchema = {
  categoryKey: "mouse",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "wireless", label: "Inalámbrico", type: "bool", aliases: ["inalambrico", "wireless"] },
    { key: "max_dpi", label: "DPI máximo", type: "number", unit: "DPI", aliases: ["resolucion de movimiento", "movement resolution"] },
    { key: "sensor", label: "Sensor", type: "text", aliases: ["tecnologia de deteccion de movimiento", "movement detection technology"] },
    { key: "buttons", label: "Botones", type: "number", aliases: ["numero de botones", "number of buttons"] },
    { key: "rgb", label: "Iluminación RGB", type: "bool", aliases: ["iluminacion", "lighting"] },
  ],
};

export const KEYBOARD_SCHEMA: CategorySchema = {
  categoryKey: "keyboard",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "wireless", label: "Inalámbrico", type: "bool", aliases: ["inalambrico", "wireless"] },
    { key: "mechanical", label: "Mecánico", type: "bool", aliases: ["teclado mecanico", "mechanical keyboard"] },
    { key: "switch_type", label: "Switches", type: "text", aliases: ["tipo de interruptor de teclas", "keyboard key switch"] },
    { key: "layout", label: "Distribución", type: "text", aliases: ["disposicion del teclado", "keyboard layout"] },
    { key: "form_factor", label: "Formato", type: "enum", values: ["Full size", "TKL", "75%", "65%", "60%"], aliases: ["factor de forma de teclado", "keyboard form factor"] },
    { key: "rgb", label: "Iluminación RGB", type: "bool", aliases: ["iluminacion", "lighting", "teclado retroiluminado"] },
  ],
};

export const HEADSET_SCHEMA: CategorySchema = {
  categoryKey: "headset",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "wireless", label: "Inalámbrico", type: "bool", aliases: ["inalambrico", "wireless"] },
    { key: "form", label: "Tipo", type: "enum", values: ["Vincha", "In-ear", "Earbuds", "Clip"], aliases: ["estilo de uso", "wearing style"] },
    { key: "microphone", label: "Micrófono", type: "bool", aliases: ["microfono", "microphone"] },
    { key: "connector", label: "Conector", type: "text", aliases: ["conector de 3,5 mm", "3.5 mm connector", "conector usb"] },
    { key: "surround", label: "Sonido envolvente", type: "text", aliases: ["sonido envolvente virtual", "virtual surround"] },
    { key: "noise_cancelling", label: "Cancelación de ruido", type: "bool", aliases: ["cancelacion de ruido", "noise cancelling"] },
  ],
};
