import { CategorySchema, GENERIC_ATTRIBUTES } from "./types";

export const ROUTER_SCHEMA: CategorySchema = {
  categoryKey: "router",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "wifi_standard", label: "Estándar Wi-Fi", type: "enum", values: ["Wi-Fi 4", "Wi-Fi 5", "Wi-Fi 6", "Wi-Fi 6E", "Wi-Fi 7"], aliases: ["estandar wi-fi", "wi-fi standards", "top wi-fi standard"] },
    { key: "speed_mbps", label: "Velocidad total", type: "number", unit: "Mbps", aliases: ["tasa de transferencia (max)", "maximum data transfer rate"] },
    { key: "bands", label: "Bandas", type: "text", aliases: ["banda wifi", "wi-fi band"] },
    { key: "lan_ports", label: "Puertos LAN", type: "number", aliases: ["cantidad de puertos ethernet lan ( rj-45)", "ethernet lan (rj-45) ports"] },
    { key: "mesh", label: "Mesh", type: "bool", aliases: ["mesh", "malla"] },
  ],
};

export const SWITCH_SCHEMA: CategorySchema = {
  categoryKey: "switch",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "ports", label: "Puertos", type: "number", aliases: ["cantidad de puertos basicos de conmutacion rj-45 ethernet", "quantity of basic switching rj-45 ethernet ports"] },
    { key: "speed", label: "Velocidad por puerto", type: "enum", values: ["10/100", "Gigabit", "2.5G", "10G"], aliases: ["tipo de puertos basicos de conmutacion rj-45 ethernet", "basic switching rj-45 ethernet ports type"] },
    { key: "managed", label: "Administrable", type: "enum", values: ["No administrable", "Smart", "Administrable"], aliases: ["tipo de interruptor", "switch type"] },
    { key: "poe", label: "PoE", type: "bool", aliases: ["power over ethernet (poe)"] },
    { key: "rack_mount", label: "Montaje en rack", type: "bool", aliases: ["montaje en rack", "rack mounting"] },
  ],
};
