import { ChatHub } from "./chat.hub";

describe("ChatHub", () => {
  it("marca en línea mientras hay una sesión SSE y avisa al cortar", () => {
    const hub = new ChatHub();
    const seen: { type: string; data: unknown }[] = [];
    const off = hub.subscribe("u1", "t1", "ana", (event) => seen.push(event));
    expect(hub.isOnline("u1")).toBe(true);
    expect(hub.onlineUserIds()).toEqual(["u1"]);
    expect(seen.some((row) => row.type === "presence")).toBe(true);

    const extra: { type: string; data: unknown }[] = [];
    const off2 = hub.subscribe("u2", "t2", "juan", (event) => extra.push(event));
    expect(extra.some((row) => row.type === "presence" && (row.data as { userId: string }).userId === "u1")).toBe(false);

    off();
    expect(hub.isOnline("u1")).toBe(false);
    expect(extra.some((row) => row.type === "presence" && (row.data as { online: boolean }).online === false)).toBe(
      true
    );
    off2();
  });

  it("el typing expira y no se pisa a uno mismo", () => {
    const hub = new ChatHub();
    const first = hub.setTyping("th", "u1", "ana");
    expect(first).toEqual([{ userId: "u1", username: "ana" }]);
    const second = hub.setTyping("th", "u1", "ana");
    expect(second).toHaveLength(1);
    const third = hub.setTyping("th", "u2", "juan");
    expect(third.map((row) => row.userId).sort()).toEqual(["u1", "u2"]);
  });
});
