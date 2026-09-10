"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { publicBrandApi, type PublicBrandLanding } from "@/lib/api";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import BrandHtmlCanvas from "@/components/org/BrandHtmlCanvas";
import { BrandSpaceLanding, landingModuleSlots } from "@/components/org/BrandSpaceLanding";
import { Loader2 } from "lucide-react";

export default function PublicBrandLandingPage() {
  const params = useParams<{ publicKey: string }>();
  const [landing, setLanding] = useState<PublicBrandLanding | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params.publicKey) return;
    publicBrandApi
      .get(params.publicKey)
      .then((res) => setLanding(res.data))
      .catch(() => setMissing(true));
  }, [params.publicKey]);

  const blocks = Array.isArray(landing?.blocks)
    ? (landing.blocks as { title?: string; body?: string; url?: string }[])
    : [];

  const customHtml = Boolean(landing?.htmlDocument);
  const darkShell = missing || !landing || !customHtml;

  return (
    <div className={darkShell ? "min-h-screen bg-surface-950 text-white" : "min-h-screen bg-white text-slate-900"}>
      <header
        className={`px-4 sm:px-8 py-3 flex items-center justify-between border-b ${
          darkShell ? "border-surface-800" : "border-slate-200"
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <NodoLogo className="w-6 h-6" />
          <NodoWordmark className="h-3" />
        </Link>
        <span className={`text-[11px] ${darkShell ? "text-surface-500" : "text-slate-400"}`}>Marca en NODO</span>
      </header>

      {missing ? (
        <main className="max-w-lg mx-auto px-4 py-24 text-center">
          <h1 className="text-xl font-semibold mb-2">Esta página no está disponible</h1>
          <p className="text-sm text-surface-400">El enlace no existe o la marca todavía no publicó su landing.</p>
        </main>
      ) : !landing ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : (
        <BrandSpaceLanding
          variant="public"
          name={landing.name}
          accent={landing.primaryColor || "#22c55e"}
          theme={{
            logoUrl: landing.logoUrl,
            heroUrl: landing.heroUrl,
            headline: landing.headline,
            about: landing.about,
          }}
          contact={{
            websiteUrl: landing.websiteUrl,
            supportEmail: landing.supportEmail,
            supportPhone: landing.supportPhone,
          }}
          products={landing.products ?? []}
          actions={landing.actions ?? []}
          news={landing.news ?? []}
          materials={landing.materials ?? []}
          trainings={landing.trainings ?? []}
          extraBlocks={blocks}
          html={
            landing.htmlDocument ? (
              <BrandHtmlCanvas
                html={landing.htmlDocument}
                slots={landingModuleSlots({
                  name: landing.name,
                  products: landing.products ?? [],
                  actions: landing.actions ?? [],
                  news: landing.news ?? [],
                  materials: landing.materials ?? [],
                  trainings: landing.trainings ?? [],
                  contact: {
                    websiteUrl: landing.websiteUrl,
                    supportEmail: landing.supportEmail,
                    supportPhone: landing.supportPhone,
                  },
                  hub: false,
                  logoUrl: landing.logoUrl,
                })}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}
