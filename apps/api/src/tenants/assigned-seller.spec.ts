import { mapAssignedSeller } from "./assigned-seller";

describe("mapAssignedSeller", () => {
  it("arma la ficha del vendedor con cargo, rol y contacto de la empresa", () => {
    expect(
      mapAssignedSeller({
        user: { id: "u1", username: "ana.perez", email: "ana@nb.com" },
        membership: { role: "SELLER", title: "Ejecutiva de cuentas" },
        org: { contactEmail: "ventas@nb.com", contactPhone: "11-4011-8800" },
      })
    ).toEqual({
      id: "u1",
      name: "ana.perez",
      email: "ana@nb.com",
      title: "Ejecutiva de cuentas",
      role: "SELLER",
      roleLabel: "Vendedor",
      orgEmail: "ventas@nb.com",
      orgPhone: "11-4011-8800",
    });
  });

  it("sin usuario no inventa vendedor", () => {
    expect(mapAssignedSeller({ user: null, org: { contactPhone: "11-1" } })).toBeNull();
  });

  it("sin membresía igual muestra nombre y mail", () => {
    const view = mapAssignedSeller({
      user: { id: "u2", username: "juan", email: "juan@elit.com" },
    });
    expect(view).toMatchObject({ name: "juan", email: "juan@elit.com", title: null, role: null, roleLabel: null });
  });
});
