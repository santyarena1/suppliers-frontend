"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert, X } from "lucide-react";

interface Props {
  password: string;
  onDismiss: () => void;
}

/**
 * Muestra una contraseña recién generada. La plataforma solo guarda su hash, así
 * que este es el único momento en que puede leerse: si se cierra sin copiarla
 * hay que generar otra.
 */
export default function GeneratedPassword({ password, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles queda visible para copiarla a mano.
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0" /> Copiala ahora
        </p>
        <button type="button" onClick={onDismiss} className="text-amber-500/60 hover:text-amber-300" aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg bg-surface-950 px-3 py-2 font-mono text-sm text-white">
          {password}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-surface-700 p-2 text-surface-300 transition-all hover:border-brand-500/40 hover:text-white"
          aria-label="Copiar contraseña"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <p className="text-[11px] text-amber-200/70">
        No se vuelve a mostrar. Si la perdés, generá una nueva.
      </p>
    </div>
  );
}
