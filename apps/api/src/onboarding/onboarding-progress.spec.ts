import { BadRequestException } from "@nestjs/common";
import { RETAILER_ONBOARDING_STEPS } from "./onboarding-steps";
import { OnboardingService } from "./onboarding.service";

const retailerOwner = {
  userId: "u1",
  tenantId: "t1",
  tenantName: "Local Uno",
  tenantType: "RETAILER",
  tenantRole: "OWNER",
};

function makeService(user: Record<string, unknown>, tenant: Record<string, unknown> | null = retailerOwner) {
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "u1",
        username: "ana",
        role: "ROLE_USER",
        onboardingCompletedAt: null,
        onboardingPreviewRestoreTenantId: null,
        onboardingReplay: false,
        onboardingStep: null,
        ...user,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    tenant: { findUnique: jest.fn().mockResolvedValue({ demoSeededAt: new Date(), plan: "PRO" }) },
    tenantProductOffer: { count: jest.fn().mockResolvedValue(12) },
  };
  const tenantContext = { forUser: jest.fn().mockResolvedValue(tenant) };
  return { service: new OnboardingService(prisma as never, {} as never, tenantContext as never), prisma };
}

describe("Recorrido · pasos", () => {
  it("no tiene el paso Plan suelto ni pasos sin acción clara", () => {
    const ids = RETAILER_ONBOARDING_STEPS.map((step) => step.id);
    expect(ids).not.toContain("plan");
    expect(ids).toEqual(expect.arrayContaining(["welcome", "search", "add-to-cart", "cart", "orders", "done"]));
  });

  it("agregar al carrito se completa haciéndolo, no con 'siguiente'", () => {
    const add = RETAILER_ONBOARDING_STEPS.find((step) => step.id === "add-to-cart");
    expect(add?.completeWhen).toBe("cart-has-items");
  });
});

describe("Recorrido · modo vendedor", () => {
  // stepsFor es privado: se prueba la regla tal como lo usa el servicio.
  const stepsFor = (role: string, plan: string) =>
    (OnboardingService.prototype as unknown as {
      stepsFor: (o: unknown) => { id: string }[];
    }).stepsFor.call({}, { type: "RETAILER", role, hasTenant: true, mode: "existing", plan }).map((s: { id: string }) => s.id);

  it("con modo vendedor, al vendedor no le muestra carrito, pedidos ni factura (no ve costos)", () => {
    const ids = stepsFor("SELLER", "PRO");
    for (const id of ["add-to-cart", "cart", "orders", "order-online", "invoice"]) expect(ids).not.toContain(id);
    expect(ids).toContain("quotes");
  });

  it("en Base (sin modo vendedor) el vendedor sigue viendo el carrito y no ve presupuestos", () => {
    const ids = stepsFor("SELLER", "BASE");
    expect(ids).toContain("cart");
    expect(ids).not.toContain("quotes");
  });

  it("el dueño con Pro ve compras y también márgenes y presupuestos", () => {
    const ids = stepsFor("OWNER", "PRO");
    for (const id of ["cart", "sale-margins", "seller-view", "quotes"]) expect(ids).toContain(id);
  });
});

describe("OnboardingService.status · paso actual", () => {
  it("un comercio nuevo arranca en el primer paso del recorrido", async () => {
    const { service } = makeService({});
    const status = await service.status("u1");
    expect(status.currentStep).toBe("welcome");
    expect(status.steps.map((s) => s.id)).not.toContain("org");
  });

  it("retoma donde quedó, sin volver al principio", async () => {
    const { service } = makeService({ onboardingStep: "cart" });
    const status = await service.status("u1");
    expect(status.currentStep).toBe("cart");
  });

  it("si el paso guardado ya no existe para su rol, vuelve al primero", async () => {
    const { service } = makeService({ onboardingStep: "team" }, { ...retailerOwner, tenantRole: "SELLER" });
    const status = await service.status("u1");
    expect(status.currentStep).toBe("welcome");
  });
});

describe("OnboardingService.setStep", () => {
  it("guarda el paso en el servidor", async () => {
    const { service, prisma } = makeService({});
    await service.setStep("u1", "orders");
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { onboardingStep: "orders" } });
  });

  it("rechaza pasos que no son del recorrido de esa persona", async () => {
    const { service } = makeService({});
    await expect(service.setStep("u1", "cualquiera")).rejects.toBeInstanceOf(BadRequestException);
  });
});
