"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2, Loader2 } from "lucide-react";
import { brandLinkApi, type BrandPublicLinkState } from "@/lib/api";
import { getTenant, getToken } from "@/lib/auth";
import { savePendingBrandLink } from "@/lib/pending-brand-link";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

type View =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "state"; value: BrandPublicLinkState }
  | { kind: "hidden" };

/**
 * Franja del link público de la marca: vincular el comercio con la marca en NODO.
 * Con sesión de comercio o distro, un clic. Sin sesión, entra o se crea la cuenta
 * y la app le ofrece el vínculo al volver.
 */
export function PublicLinkCta({ publicKey, brandName, accent }: { publicKey: string; brandName: string; accent: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tenant = getToken() ? getTenant() : null;
    if (!getToken()) {
      setView({ kind: "guest" });
      return;
    }
    if (!tenant) {
      // Tiene usuario pero todavía no creó su comercio: se lo ofrecemos al terminar.
      setView({ kind: "guest" });
      return;
    }
    if (tenant.type !== "RETAILER" && tenant.type !== "DISTRIBUTOR") {
      setView({ kind: "hidden" });
      return;
    }
    brandLinkApi
      .state(publicKey)
      .then((res) => setView({ kind: "state", value: res.data }))
      .catch(() => setView({ kind: "hidden" }));
  }, [publicKey]);

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const res = await brandLinkApi.link(publicKey);
      router.push(`/marcas/${res.data.linkId}`);
    } catch (err) {
      setError(errMsg(err, "No se pudo vincular"));
      setBusy(false);
    }
  }

  function remember() {
    savePendingBrandLink(publicKey, brandName);
  }

  if (view.kind === "loading" || view.kind === "hidden") return null;

  const hasSession = Boolean(getToken());
  let body: React.ReactNode;
  if (view.kind === "guest") {
    body = (
      <>
        <Copy
          title={`¿Tenés un comercio? Trabajá con ${brandName} en NODO`}
          text="Stock por distribuidor, precios de referencia, lanzamientos y acciones de la marca, todo en un lugar."
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href={hasSession ? "/onboarding" : "/register"}
            onClick={remember}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-black"
            style={{ backgroundColor: accent }}
          >
            {hasSession ? "Terminar mi alta y vincular" : "Crear cuenta y vincular"}
            <ArrowRight className="w-4 h-4" />
          </Link>
          {!hasSession && (
            <Link
              href="/login"
              onClick={remember}
              className="inline-flex items-center rounded-lg border border-white/20 px-3.5 py-2 text-sm text-white hover:border-white/40"
            >
              Ya tengo cuenta
            </Link>
          )}
        </div>
      </>
    );
  } else if (view.value.state === "LINKED") {
    body = (
      <>
        <Copy title={`Ya trabajás con ${brandName} en NODO`} text="Abrí su espacio para ver stock, acciones y material." />
        <Link
          href={`/marcas/${view.value.linkId}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-black"
          style={{ backgroundColor: accent }}
        >
          Abrir en NODO
          <ArrowRight className="w-4 h-4" />
        </Link>
      </>
    );
  } else if (view.value.state === "CAN_LINK") {
    body = (
      <>
        <Copy
          title={`Vinculá tu organización con ${brandName}`}
          text="Vas a ver el stock por distribuidor, sus acciones y su material dentro de NODO."
        />
        <button
          type="button"
          onClick={link}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Vincular con {brandName}
        </button>
      </>
    );
  } else {
    body = <Copy title={`Vincularse con ${brandName}`} text={view.value.reason} />;
  }

  return (
    <aside className="max-w-6xl mx-auto w-full px-4 sm:px-6 mt-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur px-4 py-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {body}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </aside>
  );
}

function Copy({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-white/60 mt-0.5">{text}</p>
    </div>
  );
}
