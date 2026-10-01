"use client";

import DOMPurify from "dompurify";

/**
 * HTML que escriben marcas y distribuidores (noticias, landing de marca).
 *
 * Se limpia con DOMPurify antes de tocar el DOM: fuera scripts, iframes,
 * formularios, atributos on*, y links javascript:/data:. El token de sesión
 * vive en el navegador, así que un HTML con código adentro le robaría la cuenta
 * a quien lo abra. En el servidor no hay DOM para limpiar: devuelve vacío y el
 * componente lo pinta recién en el navegador.
 */

const FORBID_TAGS = ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "base", "meta", "link"];

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  // Los links que abren otra pestaña no le dejan a la página nueva control sobre la nuestra.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

export function sanitizeRichHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  ensureHooks();
  return DOMPurify.sanitize(html, { FORBID_TAGS, ALLOW_UNKNOWN_PROTOCOLS: false });
}

/** Documento completo de una marca: conserva sus <style> (van al shadow root). */
export function sanitizeBrandDocument(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  ensureHooks();
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    ADD_TAGS: ["style"],
    FORCE_BODY: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
