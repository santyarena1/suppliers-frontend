"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PlayCircle, X } from "lucide-react";
import { getTenant } from "@/lib/auth";
import { tutorialForPath } from "@/lib/tutorials";

/** Botón "Ver tutorial" arriba de cada módulo: abre su video ahí mismo. */
export default function TutorialBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tutorial = tutorialForPath(pathname, getTenant()?.type);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!tutorial) return null;

  return (
    <>
      <div className="flex shrink-0 justify-end border-b border-surface-800 px-4 py-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-300 transition-colors hover:text-white"
        >
          <PlayCircle className="h-3.5 w-3.5" aria-hidden />
          Ver tutorial
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
            className="relative w-full max-w-5xl border border-surface-800 bg-surface-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-surface-800 px-4 py-3">
              <h2 id="tutorial-title" className="text-sm font-semibold tracking-tight text-white">
                {tutorial.title}
              </h2>
              <button
                type="button"
                aria-label="Cerrar tutorial"
                onClick={() => setOpen(false)}
                className="text-surface-400 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <video
              key={tutorial.src}
              src={tutorial.src}
              controls
              autoPlay
              playsInline
              className="block max-h-[80dvh] w-full bg-black"
            />
          </div>
        </div>
      )}
    </>
  );
}
