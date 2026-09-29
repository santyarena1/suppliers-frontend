"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, X } from "lucide-react";
import { brandLinkApi } from "@/lib/api";
import { SESSION_EVENT, getTenant } from "@/lib/auth";
import { clearPendingBrandLink, readPendingBrandLink, type PendingBrandLink } from "@/lib/pending-brand-link";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Quien pidió vincularse con una marca desde su link público antes de tener
 * cuenta o comercio: al entrar a la app se le ofrece terminar el vínculo.
 */
export default function PendingBrandLinkBanner() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingBrandLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function check() {
      const next = readPendingBrandLink();
      const tenant = getTenant();
      if (!next || !tenant) {
        setPending(null);
        return;
      }
      if (tenant.type !== "RETAILER" && tenant.type !== "DISTRIBUTOR") {
        setPending(null);
        return;
      }
      brandLinkApi
        .state(next.publicKey)
        .then((res) => {
          if (res.data.state === "CAN_LINK") {
            setPending(next);
            return;
          }
          // Ya vinculado o cerrado: no hay nada que ofrecer.
          clearPendingBrandLink();
          setPending(null);
        })
        .catch(() => setPending(null));
    }
    check();
    window.addEventListener(SESSION_EVENT, check);
    return () => window.removeEventListener(SESSION_EVENT, check);
  }, []);

  if (!pending) return null;

  async function link() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await brandLinkApi.link(pending.publicKey);
      clearPendingBrandLink();
      setPending(null);
      router.push(`/marcas/${res.data.linkId}`);
    } catch (err) {
      setError(errMsg(err, "No se pudo vincular"));
      setBusy(false);
    }
  }

  function dismiss() {
    clearPendingBrandLink();
    setPending(null);
  }

  return (
    <div role="status" className="flex-shrink-0 border-b border-brand-500/30 bg-brand-500/10 px-4 sm:px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link2 className="w-4 h-4 text-brand-300" />
        <p className="text-sm text-white flex-1 min-w-[200px]">
          Abriste el link de <strong>{pending.brandName}</strong>. ¿Vinculamos tu organización con la marca?
        </p>
        <button
          type="button"
          onClick={link}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Vincular
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
          Ahora no
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
