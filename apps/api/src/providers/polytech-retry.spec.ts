import {
  POLYTECH_MAX_ATTEMPTS,
  polytechRetryDelayMs,
  sendPolytechWithRetry,
  type PolytechRawResponse,
} from "./polytech-client";

const ok: PolytechRawResponse = { ok: true, status: 200, retryAfter: null, text: "{}" };
const limited = (retryAfter: string | null = null): PolytechRawResponse => ({ ok: false, status: 429, retryAfter, text: "" });

function scripted(responses: PolytechRawResponse[]) {
  const send = jest.fn(async () => responses.shift() ?? ok);
  const waits: number[] = [];
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  return { send, waits, wait };
}

describe("polytechRetryDelayMs", () => {
  it("429 con Retry-After en segundos, acotado a 60 s", () => {
    expect(polytechRetryDelayMs(429, "7", 0)).toBe(7_000);
    expect(polytechRetryDelayMs(429, "600", 0)).toBe(60_000);
  });

  it("429 con Retry-After como fecha HTTP", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(polytechRetryDelayMs(429, "Thu, 22 Oct 2026 12:00:20 GMT", 0, now)).toBe(20_000);
    expect(polytechRetryDelayMs(429, "Thu, 22 Oct 2026 11:00:00 GMT", 0, now)).toBe(0);
  });

  it("429 sin Retry-After: 10 s, 20 s…", () => {
    expect(polytechRetryDelayMs(429, null, 0)).toBe(10_000);
    expect(polytechRetryDelayMs(429, "basura", 1)).toBe(20_000);
    expect(polytechRetryDelayMs(429, null, 10)).toBe(60_000);
  });

  it("502/503 sigue con la espera corta de antes", () => {
    expect(polytechRetryDelayMs(503, null, 0)).toBe(1_500);
    expect(polytechRetryDelayMs(502, "30", 1)).toBe(3_000);
  });
});

describe("sendPolytechWithRetry", () => {
  it("un 429 espera lo que dice Retry-After y reintenta", async () => {
    const { send, waits, wait } = scripted([limited("3"), ok]);
    const res = await sendPolytechWithRetry(send, { retry: true, wait });
    expect(res.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([3_000]);
  });

  it("si sigue limitado corta en el tope de intentos y devuelve el 429", async () => {
    const { send, waits, wait } = scripted([limited(), limited(), limited(), limited()]);
    const res = await sendPolytechWithRetry(send, { retry: true, wait });
    expect(res.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(POLYTECH_MAX_ATTEMPTS);
    expect(waits).toEqual([10_000, 20_000]);
  });

  it("el alta de pedido (sin retry) no reintenta ni ante 429", async () => {
    const { send, waits, wait } = scripted([limited("1"), ok]);
    const res = await sendPolytechWithRetry(send, { retry: false, wait });
    expect(res.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it("un 400 o 401 no se reintenta", async () => {
    const { send, wait } = scripted([{ ok: false, status: 401, retryAfter: null, text: "no" }, ok]);
    const res = await sendPolytechWithRetry(send, { retry: true, wait });
    expect(res.status).toBe(401);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
