import { CategorySchema, GENERIC_ATTRIBUTES } from "./types";

export const MONITOR_SCHEMA: CategorySchema = {
  categoryKey: "monitor",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "size_in", label: "Tamaño", type: "number", unit: "pulgadas", aliases: ["diagonal de la pantalla", "display diagonal"] },
    { key: "resolution", label: "Resolución", type: "text", aliases: ["resolucion de la pantalla", "display resolution"] },
    { key: "refresh_hz", label: "Frecuencia", type: "number", unit: "Hz", aliases: ["frecuencia de actualizacion maxima", "maximum refresh rate"] },
    { key: "panel", label: "Panel", type: "enum", values: ["IPS", "VA", "TN", "OLED", "QD-OLED", "Mini-LED"], aliases: ["tipo de panel", "panel type"] },
    { key: "response_ms", label: "Tiempo de respuesta", type: "number", unit: "ms", aliases: ["tiempo de respuesta", "response time"] },
    { key: "curved", label: "Curvo", type: "bool", aliases: ["pantalla curva", "curved"] },
    { key: "hdmi_ports", label: "Puertos HDMI", type: "number", aliases: ["cantidad de puertos hdmi", "numero de puertos hdmi", "hdmi ports quantity"] },
    { key: "displayport_ports", label: "DisplayPorts", type: "number", aliases: ["cantidad de displayports", "displayports quantity"] },
    { key: "adaptive_sync", label: "Sincronización adaptativa", type: "text", aliases: ["tecnologia de sincronizacion adaptable", "adaptive-sync technology"] },
    { key: "speakers", label: "Parlantes", type: "bool", aliases: ["altavoces incorporados", "built-in speaker(s)"] },
  ],
};

export const NOTEBOOK_SCHEMA: CategorySchema = {
  categoryKey: "notebook",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "cpu", label: "Procesador", type: "text", aliases: ["modelo del procesador", "processor model"] },
    { key: "ram_gb", label: "Memoria RAM", type: "number", unit: "GB", aliases: ["memoria interna", "internal memory"] },
    { key: "storage_gb", label: "Almacenamiento", type: "number", unit: "GB", aliases: ["capacidad total de almacenaje", "total storage capacity"] },
    { key: "storage_type", label: "Tipo de almacenamiento", type: "enum", values: ["SSD", "HDD", "eMMC", "SSD+HDD"], aliases: ["medios de almacenaje", "storage media"] },
    { key: "screen_in", label: "Pantalla", type: "number", unit: "pulgadas", aliases: ["diagonal de la pantalla", "display diagonal"] },
    { key: "resolution", label: "Resolución", type: "text", aliases: ["resolucion de la pantalla", "display resolution"] },
    {
      key: "gpu",
      label: "Gráficos",
      type: "text",
      aliases: ["modelo de adaptador de graficos discretos", "discrete graphics adapter model", "modelo de adaptador grafico incorporado", "on-board graphics adapter model"],
    },
    { key: "os", label: "Sistema operativo", type: "text", aliases: ["sistema operativo instalado", "operating system installed"] },
    { key: "battery_wh", label: "Batería", type: "number", unit: "Wh", aliases: ["capacidad de bateria", "battery capacity"] },
    { key: "keyboard_layout", label: "Teclado", type: "text", aliases: ["disposicion del teclado", "keyboard layout"] },
  ],
};
