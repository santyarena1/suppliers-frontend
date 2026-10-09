import { CategorySchema, GENERIC_ATTRIBUTES } from "./types";

/** Componentes de PC: placa de video, mother, procesador, RAM, fuente, gabinete, cooler. */

export const GPU_SCHEMA: CategorySchema = {
  categoryKey: "gpu",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "chipset_brand", label: "Fabricante del chip", type: "enum", values: ["NVIDIA", "AMD", "Intel"], aliases: ["familia de procesadores de graficos", "graphics processor family"] },
    { key: "gpu_model", label: "Procesador gráfico", type: "text", aliases: ["procesador grafico", "graphics processor"] },
    { key: "memory_gb", label: "Memoria", type: "number", unit: "GB", aliases: ["capacidad memoria de adaptador grafico", "discrete graphics adapter memory"] },
    { key: "memory_type", label: "Tipo de memoria", type: "enum", values: ["GDDR5", "GDDR6", "GDDR6X", "GDDR7", "HBM2", "DDR4"], aliases: ["tipo de memoria de adaptador grafico", "graphics adapter memory type"] },
    { key: "memory_bus_bits", label: "Bus de memoria", type: "number", unit: "bit", aliases: ["ancho de datos", "memory bus"] },
    { key: "boost_clock_mhz", label: "Frecuencia boost", type: "number", unit: "MHz", aliases: ["aumento de la velocidad de reloj del procesador", "processor boost clock speed"] },
    { key: "interface", label: "Interfaz", type: "text", aliases: ["tipo de interfaz", "interface type"] },
    { key: "hdmi_ports", label: "Puertos HDMI", type: "number", aliases: ["numero de puertos hdmi", "hdmi ports quantity"] },
    { key: "displayport_ports", label: "DisplayPorts", type: "number", aliases: ["cantidad de displayports", "displayports quantity"] },
    { key: "recommended_psu_w", label: "Fuente recomendada", type: "number", unit: "W", aliases: ["suministro de energia al sistema minimo", "minimum system power supply"] },
    { key: "power_connectors", label: "Conectores de energía", type: "text", aliases: ["conectores de energia suplementario", "supplementary power connectors"] },
    { key: "length_mm", label: "Largo", type: "number", unit: "mm", aliases: ["longitud", "length"] },
    { key: "slots", label: "Ranuras que ocupa", type: "number", aliases: ["numero de ranuras", "number of slots"] },
    { key: "fans", label: "Ventiladores", type: "number", aliases: ["numero de ventiladores", "number of fans"] },
  ],
};

export const MOTHERBOARD_SCHEMA: CategorySchema = {
  categoryKey: "motherboard",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "socket", label: "Socket", type: "text", aliases: ["socket de procesador", "processor socket"] },
    { key: "chipset", label: "Chipset", type: "text", aliases: ["chipset de placa base", "motherboard chipset"] },
    { key: "form_factor", label: "Formato", type: "enum", values: ["ATX", "Micro-ATX", "Mini-ITX", "E-ATX", "Mini-DTX"], aliases: ["factor de forma de placa base", "motherboard form factor"] },
    { key: "memory_type", label: "Tipo de memoria", type: "enum", values: ["DDR3", "DDR4", "DDR5"], aliases: ["tipos de memoria compatibles", "supported memory types"] },
    { key: "memory_slots", label: "Ranuras de memoria", type: "number", aliases: ["numero de ranuras de memoria", "number of memory slots"] },
    { key: "max_memory_gb", label: "Memoria máxima", type: "number", unit: "GB", aliases: ["memoria interna maxima", "maximum internal memory"] },
    { key: "m2_slots", label: "Ranuras M.2", type: "number", aliases: ["cantidad de ranuras m.2", "number of m.2 slots"] },
    { key: "sata_ports", label: "Puertos SATA", type: "number", aliases: ["numero de conectores sata iii", "number of sata iii connectors"] },
    { key: "wifi", label: "Wi-Fi integrado", type: "bool", aliases: ["wifi", "wi-fi"] },
    { key: "bluetooth", label: "Bluetooth", type: "bool", aliases: ["bluetooth"] },
  ],
};

export const CPU_SCHEMA: CategorySchema = {
  categoryKey: "cpu",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "socket", label: "Socket", type: "text", aliases: ["socket de procesador", "processor socket"] },
    { key: "cores", label: "Núcleos", type: "number", aliases: ["numero de nucleos de procesador", "processor cores"] },
    { key: "threads", label: "Hilos", type: "number", aliases: ["numero de filamentos de procesador", "processor threads"] },
    { key: "base_clock_ghz", label: "Frecuencia base", type: "number", unit: "GHz", aliases: ["frecuencia del procesador", "processor base frequency"] },
    { key: "boost_clock_ghz", label: "Frecuencia turbo", type: "number", unit: "GHz", aliases: ["frecuencia del procesador turbo", "processor boost frequency"] },
    { key: "cache_mb", label: "Caché", type: "number", unit: "MB", aliases: ["cache del procesador", "processor cache"] },
    { key: "tdp_w", label: "TDP", type: "number", unit: "W", aliases: ["potencia de diseno termico (tdp)", "thermal design power (tdp)"] },
    { key: "integrated_graphics", label: "Gráficos integrados", type: "text", aliases: ["modelo de adaptador grafico incorporado", "on-board graphics adapter model"] },
    { key: "cooler_included", label: "Incluye cooler", type: "bool", aliases: ["disipador incluido", "cooler included"] },
  ],
};

export const RAM_SCHEMA: CategorySchema = {
  categoryKey: "ram",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "capacity_gb", label: "Capacidad", type: "number", unit: "GB", aliases: ["memoria interna", "internal memory"] },
    { key: "memory_type", label: "Tipo", type: "enum", values: ["DDR3", "DDR3L", "DDR4", "DDR5"], aliases: ["tipo de memoria interna", "internal memory type"] },
    { key: "speed_mhz", label: "Velocidad", type: "number", unit: "MHz", aliases: ["velocidad de memoria del reloj", "memory clock speed"] },
    { key: "form_factor", label: "Formato", type: "enum", values: ["DIMM", "SO-DIMM"], aliases: ["forma de factor de memoria", "memory form factor"] },
    { key: "modules", label: "Módulos", type: "text", aliases: ["diseno de memoria (modulos x tamano)", "memory layout (modules x size)"] },
    { key: "cas_latency", label: "Latencia CAS", type: "number", aliases: ["latencia cas", "cas latency"] },
    { key: "rgb", label: "Iluminación RGB", type: "bool", aliases: ["iluminacion", "lighting"] },
  ],
};

export const PSU_SCHEMA: CategorySchema = {
  categoryKey: "psu",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "power_w", label: "Potencia", type: "number", unit: "W", aliases: ["potencia total", "total power"] },
    {
      key: "efficiency",
      label: "Certificación",
      type: "enum",
      values: ["80 PLUS", "80 PLUS Bronze", "80 PLUS Silver", "80 PLUS Gold", "80 PLUS Platinum", "80 PLUS Titanium"],
      aliases: ["certificacion 80 plus", "80 plus certification"],
    },
    { key: "modular", label: "Modular", type: "enum", values: ["No", "Semi-modular", "Full modular"], aliases: ["cableado modular", "modular cabling"] },
    { key: "form_factor", label: "Formato", type: "enum", values: ["ATX", "SFX", "SFX-L", "TFX"], aliases: ["factor de forma", "form factor"] },
    { key: "pcie_connectors", label: "Conectores PCIe", type: "text", aliases: ["conectores de alimentacion pci express", "pci express power connectors"] },
    { key: "atx_version", label: "Norma ATX", type: "text", aliases: ["version atx", "atx version"] },
  ],
};

export const CASE_SCHEMA: CategorySchema = {
  categoryKey: "case",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "form_factor", label: "Formato", type: "enum", values: ["Full Tower", "Mid Tower", "Mini Tower", "SFF"], aliases: ["factor de forma", "form factor"] },
    { key: "motherboard_support", label: "Motherboards soportadas", type: "text", aliases: ["factor de forma de placa base soportada", "supported motherboard form factors"] },
    { key: "max_gpu_length_mm", label: "Largo máximo de placa de video", type: "number", unit: "mm", aliases: ["longitud maxima de la tarjeta grafica", "maximum graphics card length"] },
    { key: "max_cooler_height_mm", label: "Altura máxima de cooler", type: "number", unit: "mm", aliases: ["altura maxima del enfriador del cpu", "maximum cpu cooler height"] },
    { key: "fans_included", label: "Ventiladores incluidos", type: "number", aliases: ["numero de ventiladores incluidos", "number of fans installed"] },
    { key: "side_panel", label: "Panel lateral", type: "text", aliases: ["ventana lateral", "side window"] },
    { key: "psu_included", label: "Incluye fuente", type: "bool", aliases: ["fuente de alimentacion incluida", "power supply included"] },
  ],
};

export const COOLER_SCHEMA: CategorySchema = {
  categoryKey: "cooler",
  version: 1,
  attributes: [
    ...GENERIC_ATTRIBUTES,
    { key: "cooler_type", label: "Tipo", type: "enum", values: ["Aire", "Líquida AIO", "Ventilador de gabinete"], aliases: ["tipo", "type"] },
    { key: "sockets", label: "Sockets compatibles", type: "text", aliases: ["socket de procesador soportado", "supported processor sockets"] },
    { key: "radiator_mm", label: "Radiador", type: "number", unit: "mm", aliases: ["tamano del radiador", "radiator size"] },
    { key: "fan_size_mm", label: "Tamaño de ventilador", type: "number", unit: "mm", aliases: ["diametro de ventilador", "fan diameter"] },
    { key: "height_mm", label: "Altura", type: "number", unit: "mm", aliases: ["altura", "height"] },
    { key: "tdp_w", label: "TDP soportado", type: "number", unit: "W", aliases: ["potencia de diseno termico (tdp)", "thermal design power (tdp)"] },
    { key: "rgb", label: "Iluminación RGB", type: "bool", aliases: ["iluminacion", "lighting"] },
  ],
};
