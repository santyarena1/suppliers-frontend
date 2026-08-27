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
});
