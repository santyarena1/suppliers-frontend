import { isChatReactionEmoji } from "@nodo/shared";
import { canWriteChat, chatLinkVisibleTo, chatPeerName, chatThreadVisibleTo, formatChatPeerLine } from "./chat.access";

describe("chatLinkVisibleTo", () => {
  const link = {
    clientTenantId: "comercio",
    supplierTenantId: "distro",
    accountManagerId: "seller-1",
    status: "ACTIVE",
  };

  it("el comercio ve el hilo de su vínculo", () => {
    expect(
      chatLinkVisibleTo(link, {
        tenantId: "comercio",
        tenantType: "RETAILER",
        tenantRole: "BUYER",
        userId: "u",
      })
    ).toBe(true);
    expect(
      chatLinkVisibleTo(link, {
        tenantId: "otro",
        tenantType: "RETAILER",
        tenantRole: "OWNER",
        userId: "u",
      })
    ).toBe(false);
  });

  it("el vendedor del distribuidor solo ve sus cuentas", () => {
    expect(
      chatLinkVisibleTo(link, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "SELLER",
        userId: "seller-1",
      })
    ).toBe(true);
    expect(
      chatLinkVisibleTo(link, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "SELLER",
        userId: "otro",
      })
    ).toBe(false);
  });

  it("un vínculo revocado no se habla", () => {
    expect(
      chatLinkVisibleTo(
        { ...link, status: "REVOKED" },
        { tenantId: "comercio", tenantType: "RETAILER", tenantRole: "OWNER", userId: "u" }
      )
    ).toBe(false);
  });

  it("suspendido sigue visible: hay que poder explicar", () => {
    expect(
      chatLinkVisibleTo(
        { ...link, status: "SUSPENDED" },
        { tenantId: "comercio", tenantType: "RETAILER", tenantRole: "OWNER", userId: "u" }
      )
    ).toBe(true);
  });

  it("una marca no entra a los hilos comercio↔distribuidor", () => {
    expect(
      chatLinkVisibleTo(link, {
        tenantId: "marca",
        tenantType: "BRAND",
        tenantRole: "OWNER",
        userId: "u",
      })
    ).toBe(false);
  });

  it("una marca habla con el comercio de su propio vínculo", () => {
    const brandLink = { ...link, supplierTenantId: "marca" };
    expect(
      chatLinkVisibleTo(brandLink, {
        tenantId: "marca",
        tenantType: "BRAND",
        tenantRole: "OWNER",
        userId: "u",
      })
    ).toBe(true);
    expect(
      chatLinkVisibleTo(brandLink, {
        tenantId: "marca",
        tenantType: "BRAND",
        tenantRole: "COMMERCIAL",
        userId: "otro",
      })
    ).toBe(false);
    expect(
      chatLinkVisibleTo(brandLink, {
        tenantId: "comercio",
        tenantType: "RETAILER",
        tenantRole: "BUYER",
        userId: "u",
      })
    ).toBe(true);
  });

  it("un distro cliente de una marca ve ese vínculo, no los de otro distro", () => {
    const brandLink = {
      clientTenantId: "distro",
      supplierTenantId: "marca",
      accountManagerId: null,
      status: "ACTIVE",
    };
    expect(
      chatLinkVisibleTo(brandLink, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "OWNER",
        userId: "owner-d",
      })
    ).toBe(true);
    expect(
      chatLinkVisibleTo(brandLink, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "SELLER",
        userId: "seller-otro",
      })
    ).toBe(true);
    expect(
      chatLinkVisibleTo(brandLink, {
        tenantId: "otro-distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "OWNER",
        userId: "owner-x",
      })
    ).toBe(false);
  });

  it("un distro no ve el vínculo de otro distro con un comercio", () => {
    expect(
      chatLinkVisibleTo(link, {
        tenantId: "otro-distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "OWNER",
        userId: "u",
      })
    ).toBe(false);
  });
});

describe("canWriteChat", () => {
  it("el visor solo lee", () => {
    expect(canWriteChat("VIEWER", "RETAILER")).toBe(false);
    expect(canWriteChat("VIEWER", "DISTRIBUTOR")).toBe(false);
  });

  it("en el comercio escriben dueño, admin y comprador; el vendedor del local no", () => {
    expect(canWriteChat("OWNER", "RETAILER")).toBe(true);
    expect(canWriteChat("ADMIN", "RETAILER")).toBe(true);
    expect(canWriteChat("BUYER", "RETAILER")).toBe(true);
    expect(canWriteChat("SELLER", "RETAILER")).toBe(false);
  });

  it("en el distribuidor el vendedor y el PM sí escriben", () => {
    expect(canWriteChat("SELLER", "DISTRIBUTOR")).toBe(true);
    expect(canWriteChat("PRODUCT_MANAGER", "DISTRIBUTOR")).toBe(true);
    expect(canWriteChat("OWNER", "DISTRIBUTOR")).toBe(true);
  });

  it("en la marca escriben dueño, marketing y comercial", () => {
    expect(canWriteChat("OWNER", "BRAND")).toBe(true);
    expect(canWriteChat("MARKETING", "BRAND")).toBe(true);
    expect(canWriteChat("COMMERCIAL", "BRAND")).toBe(true);
    expect(canWriteChat("VIEWER", "BRAND")).toBe(false);
  });
});

describe("isChatReactionEmoji", () => {
  it("acepta el set cerrado y nada más", () => {
    expect(isChatReactionEmoji("👍")).toBe(true);
    expect(isChatReactionEmoji("💩")).toBe(false);
  });
});

describe("chatPeerName", () => {
  const named = {
    clientTenant: { name: "Local Centro" },
    supplierTenant: { name: "New Bytes" },
  };
  it("cada lado ve el nombre del otro", () => {
    expect(chatPeerName(named, "RETAILER")).toBe("New Bytes");
    expect(chatPeerName(named, "DISTRIBUTOR")).toBe("Local Centro");
  });

  it("si el distro es cliente de la marca, ve el nombre de la marca", () => {
    const brandLink = {
      clientTenantId: "distro",
      supplierTenantId: "marca",
      clientTenant: { name: "Elit" },
      supplierTenant: { name: "Logitech" },
    };
    expect(chatPeerName(brandLink, "DISTRIBUTOR", "distro")).toBe("Logitech");
    expect(chatPeerName(brandLink, "BRAND", "marca")).toBe("Elit");
  });
});

describe("formatChatPeerLine", () => {
  it("junta usuario, rol y organización", () => {
    expect(
      formatChatPeerLine({ username: "juan", roleLabel: "Vendedor", orgName: "Elit" })
    ).toBe("juan · Vendedor · Elit");
    expect(
      formatChatPeerLine({ name: "maría", roleLabel: "Comprador", orgName: "TecnoStore" })
    ).toBe("maría · Comprador · TecnoStore");
  });
});

describe("chatThreadVisibleTo", () => {
  const link = {
    clientTenantId: "comercio",
    supplierTenantId: "distro",
    accountManagerId: "seller-1",
    status: "ACTIVE",
  };
  const thread = { distroUserId: "seller-1", storeUserId: "buyer-1", link };

  it("el vendedor no ve el chat del dueño del distro con el mismo local", () => {
    expect(
      chatThreadVisibleTo(thread, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "OWNER",
        userId: "owner-1",
      })
    ).toBe(false);
    expect(
      chatThreadVisibleTo(thread, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "SELLER",
        userId: "seller-1",
      })
    ).toBe(true);
  });

  it("el dueño del local no ve el chat del comprador con el mismo vendedor", () => {
    expect(
      chatThreadVisibleTo(thread, {
        tenantId: "comercio",
        tenantType: "RETAILER",
        tenantRole: "OWNER",
        userId: "owner-local",
      })
    ).toBe(false);
    expect(
      chatThreadVisibleTo(thread, {
        tenantId: "comercio",
        tenantType: "RETAILER",
        tenantRole: "BUYER",
        userId: "buyer-1",
      })
    ).toBe(true);
  });

  it("si el distro es cliente de la marca, el hilo mira storeUserId", () => {
    const brandLink = {
      clientTenantId: "distro",
      supplierTenantId: "marca",
      accountManagerId: "commercial-1",
      status: "ACTIVE",
    };
    const brandThread = { distroUserId: "commercial-1", storeUserId: "owner-d", link: brandLink };
    expect(
      chatThreadVisibleTo(brandThread, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "OWNER",
        userId: "owner-d",
      })
    ).toBe(true);
    expect(
      chatThreadVisibleTo(brandThread, {
        tenantId: "distro",
        tenantType: "DISTRIBUTOR",
        tenantRole: "OWNER",
        userId: "otro-owner",
      })
    ).toBe(false);
    expect(
      chatThreadVisibleTo(brandThread, {
        tenantId: "marca",
        tenantType: "BRAND",
        tenantRole: "COMMERCIAL",
        userId: "commercial-1",
      })
    ).toBe(true);
    expect(
      chatThreadVisibleTo(brandThread, {
        tenantId: "marca",
        tenantType: "BRAND",
        tenantRole: "OWNER",
        userId: "owner-marca",
      })
    ).toBe(false);
  });
});
