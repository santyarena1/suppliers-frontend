"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * QR local. El código es secreto: no se manda a ningún servicio externo.
 */
export default function AccessCodeQr({
  code,
  label,
  orgName,
}: {
  code: string;
  label?: string | null;
  orgName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(code, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  function printQr() {
    const w = window.open("", "_blank", "noopener,noreferrer,width=480,height=640");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Código NODO</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; text-align: center; padding: 32px; color: #0f172a; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        p { font-size: 13px; color: #475569; margin: 0 0 16px; }
        code { font-size: 22px; letter-spacing: 0.12em; display: block; margin-top: 12px; }
        img { width: 260px; height: 260px; }
      </style></head><body>
      <h1>NODO</h1>
      <p>${orgName ? `Código de ${escapeHtml(orgName)}` : "Código de vinculación"}</p>
      <img src="${src}" alt="QR" />
      <code>${escapeHtml(code)}</code>
      ${label ? `<p>${escapeHtml(label)}</p>` : ""}
      <p>Canjealo en Proveedores. Hasta que salga bien, NODO no dice de quién es.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  if (!src) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-surface-500 hover:text-surface-200 text-[11px]"
      >
        QR
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white text-slate-900 rounded-xl p-5 w-full max-w-sm flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold">Imprimir o mostrar</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="QR del código" className="w-56 h-56" />
            <p className="font-mono tracking-widest text-lg">{code}</p>
            {label && <p className="text-xs text-slate-500">{label}</p>}
            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Entregalo al comercio. El canje en NODO no revela de quién es hasta que sale bien.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={printQr} className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2">
                Imprimir
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 px-3 py-2">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
