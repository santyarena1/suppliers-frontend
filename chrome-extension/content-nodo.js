// Puente entre la página de NODO (window.postMessage) y el service worker
// de la extensión (chrome.runtime). NODO no puede llamar chrome.runtime
// directamente (no es una extensión), así que este content script relay-ea
// los mensajes en ambas direcciones.

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "nodo" || data.type !== "SEND_INVID_ORDER") return;

  chrome.runtime.sendMessage({ type: "SEND_INVID_ORDER", payload: data.payload }, (response) => {
    window.postMessage(
      { source: "nodo-extension", type: "INVID_ORDER_RESULT", result: response ?? { ok: false, error: "Sin respuesta de la extensión" } },
      window.location.origin
    );
  });
});

// Le avisa a la página que la extensión está instalada y activa, para que
// NODO pueda mostrar "Extensión conectada" en vez de "Instalá la extensión".
window.postMessage({ source: "nodo-extension", type: "EXTENSION_READY" }, window.location.origin);
