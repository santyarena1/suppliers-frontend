import {
  NO_USABLE_PHOTO_ERROR,
  NO_USABLE_PHOTO_EXHAUSTED_ERROR,
  NON_RETRYABLE_ERRORS,
  PERMANENT_SKIP_ERROR,
  candidateWhere,
  nextNoUsablePhotoError,
  resolveRunPriority,
} from "./image-sync-candidates";
import { isSerperBlockingError } from "./serper-images.client";

describe("image-sync-candidates", () => {
  it("prioriza el catálogo con stock mientras quede alguno", () => {
    expect(resolveRunPriority(12)).toBe("visible");
    expect(resolveRunPriority(0)).toBe("deferred");
  });

  it("incluye fallidos y salteados reintentables, no solo nunca tocados", () => {
    expect(candidateWhere(undefined, "visible")).toEqual({
      AND: [
        {
          AND: [
            { OR: [{ imageUrl: null }, { imageUrl: "" }] },
            {
              OR: [
                { imageFills: { none: {} } },
                {
                  imageFills: {
                    some: {
                      status: { in: ["failed", "skipped"] },
                      NOT: { error: { in: NON_RETRYABLE_ERRORS } },
                    },
                  },
                },
              ],
            },
          ],
        },
        { offers: { some: { active: true, OR: [{ stock: null }, { stock: { gt: 0 } }] } } },
      ],
    });
  });

  it("deja para después los sin stock, ocultos o sin oferta", () => {
    expect(candidateWhere("ELIT", "deferred")).toEqual({
      AND: [
        {
          AND: [
            { provider: "ELIT", AND: [{ OR: [{ imageUrl: null }, { imageUrl: "" }] }] },
            {
              OR: [
                { imageFills: { none: {} } },
                {
                  imageFills: {
                    some: {
                      status: { in: ["failed", "skipped"] },
                      NOT: { error: { in: NON_RETRYABLE_ERRORS } },
                    },
                  },
                },
              ],
            },
          ],
        },
        { offers: { none: { active: true, OR: [{ stock: null }, { stock: { gt: 0 } }] } } },
      ],
    });
  });

  it("permite un solo reintento cuando Serper no devolvió foto usable", () => {
    expect(nextNoUsablePhotoError(null)).toBe(NO_USABLE_PHOTO_ERROR);
    expect(nextNoUsablePhotoError(undefined)).toBe(NO_USABLE_PHOTO_ERROR);
    expect(nextNoUsablePhotoError("timeout")).toBe(NO_USABLE_PHOTO_ERROR);
    expect(nextNoUsablePhotoError(NO_USABLE_PHOTO_ERROR)).toBe(NO_USABLE_PHOTO_EXHAUSTED_ERROR);
    expect(nextNoUsablePhotoError(NO_USABLE_PHOTO_EXHAUSTED_ERROR)).toBe(
      NO_USABLE_PHOTO_EXHAUSTED_ERROR
    );
    expect(NON_RETRYABLE_ERRORS).toContain(PERMANENT_SKIP_ERROR);
    expect(NON_RETRYABLE_ERRORS).toContain(NO_USABLE_PHOTO_EXHAUSTED_ERROR);
    expect(NON_RETRYABLE_ERRORS).not.toContain(NO_USABLE_PHOTO_ERROR);
  });
});

describe("isSerperBlockingError", () => {
  it("detecta key inválida, 429 y falta de créditos", () => {
    expect(isSerperBlockingError("La API key de Serper no es válida")).toBe(true);
    expect(isSerperBlockingError("Serper está limitando (429). Esperá un momento y reintentá.")).toBe(true);
    expect(
      isSerperBlockingError(
        "Serper sin créditos o cuota agotada. Recargá la cuenta y reintentá; los productos quedan pendientes."
      )
    ).toBe(true);
    expect(isSerperBlockingError("Serper falló: Not enough credits")).toBe(true);
  });

  it("no bloquea errores puntuales de un producto", () => {
    expect(isSerperBlockingError("timeout of 20000ms exceeded")).toBe(false);
    expect(isSerperBlockingError("ECONNRESET")).toBe(false);
  });
});
