import { assertEventPublishable, eventPatch, serializeEvent } from "./news-event";

describe("eventPatch", () => {
  it("toca solo lo que vino", () => {
    expect(eventPatch({ eventLocation: "  Showroom  " })).toEqual({ eventLocation: "Showroom" });
    expect(eventPatch({})).toEqual({});
  });

  it("valida fechas y que termine después de empezar", () => {
    expect(() => eventPatch({ eventStartsAt: "no" })).toThrow(/inicio/);
    expect(() =>
      eventPatch({ eventStartsAt: "2026-10-10T18:00:00Z", eventEndsAt: "2026-10-10T17:00:00Z" })
    ).toThrow(/terminar después/);
    const existing = { eventStartsAt: new Date("2026-10-10T18:00:00Z"), eventEndsAt: null };
    expect(() => eventPatch({ eventEndsAt: "2026-10-09T10:00:00Z" }, existing)).toThrow(/terminar después/);
  });

  it("el link tiene que ser una URL", () => {
    expect(eventPatch({ eventUrl: "https://meet.example.com/x" }).eventUrl).toBe("https://meet.example.com/x");
    expect(() => eventPatch({ eventUrl: "javascript:alert(1)" })).toThrow(/URL/);
    expect(eventPatch({ eventUrl: "" }).eventUrl).toBeNull();
  });
});

describe("assertEventPublishable / serializeEvent", () => {
  it("un evento sin fecha no se publica; otra nota sí", () => {
    expect(() => assertEventPublishable({ kind: "EVENT", eventStartsAt: null })).toThrow(/fecha/);
    expect(() => assertEventPublishable({ kind: "LAUNCH", eventStartsAt: null })).not.toThrow();
  });

  it("sin fecha no hay evento", () => {
    const base = { kind: "EVENT", eventEndsAt: null, eventLocation: null, eventUrl: null, rsvpEnabled: true };
    expect(serializeEvent({ ...base, eventStartsAt: null })).toBeNull();
    expect(serializeEvent({ ...base, eventStartsAt: new Date("2026-10-10T18:00:00Z") })).toMatchObject({
      startsAt: "2026-10-10T18:00:00.000Z",
      rsvpEnabled: true,
    });
  });

  it("el link público no lleva el link de la reunión ni inscripción", () => {
    const row = {
      kind: "EVENT",
      eventStartsAt: new Date("2026-10-10T18:00:00Z"),
      eventEndsAt: null,
      eventLocation: "Showroom",
      eventUrl: "https://meet.example.com/x",
      rsvpEnabled: true,
    };
    expect(serializeEvent(row, true)).toMatchObject({ url: null, rsvpEnabled: false, location: "Showroom" });
  });
});
