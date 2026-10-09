import { detectCategory } from "./taxonomy";

describe("taxonomía unificada", () => {
  it.each([
    ["Notebooks", "Notebook Lenovo IdeaPad Slim 3 Ryzen 5 7530U 8GB 512GB", "notebook"],
    [null, "Notebook ASUS Vivobook 15 Core i5 1235U", "notebook"],
    ["Microprocesadores", "Procesador AMD Ryzen 5 5600G AM4", "cpu"],
    ["Placas de Video", "Placa de Video ASUS Dual RTX 5060 Ti", "gpu"],
    ["Accesorios", "Cooler para notebook Noga", "cooler"],
    ["PERIFERICOS", "Mouse Logitech G203 Lightsync", "mouse"],
    ["Memorias", "Memoria Kingston Fury Beast DDR4 16GB 3200", "ram"],
    ["Almacenamiento", "Disco SSD Kingston A400 480GB", "storage_ssd"],
    ["Fuentes", "Fuente Corsair CV650 650W 80 Plus Bronze", "psu"],
    ["Conectividad", "Router TP-Link Archer C6 AC1200", "router"],
  ])("%s / %s → %s", (category, name, expected) => {
    expect(detectCategory(category, name)?.key).toBe(expected);
  });

  it("devuelve null si no reconoce nada", () => {
    expect(detectCategory("Varios", "Producto sin pistas")).toBeNull();
  });
});
