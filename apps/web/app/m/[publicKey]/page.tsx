"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { publicBrandApi, type PublicBrandLanding } from "@/lib/api";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import BrandHtmlCanvas from "@/components/org/BrandHtmlCanvas";
import { Globe, Loader2, Mail, Phone } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-surface-950 text-white">
      <header className="border-b border-surface-800 px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <NodoLogo className="w-6 h-6" />
          <NodoWordmark className="h-3" />
        </Link>
        <span className="text-[11px] text-surface-500">Marca en NODO</span>
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
        <main>
          {landing.htmlDocument ? (
            <BrandHtmlCanvas
              html={landing.htmlDocument}
              slots={{
                nombre: <span>{landing.name}</span>,
                logo: landing.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={landing.logoUrl} alt={landing.name} style={{ height: 48 }} />
                ) : null,
              }}
            />
          ) : (
          <section
            className="relative overflow-hidden border-b border-surface-800"
            style={
              landing.heroUrl
                ? { backgroundImage: `url(${landing.heroUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                : undefined
            }
          >
            <div className={`px-4 sm:px-8 py-16 sm:py-24 ${landing.heroUrl ? "bg-black/65" : "bg-gradient-to-br from-violet-800/50 via-brand-800/30 to-surface-950"}`}>
              <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                {landing.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={landing.logoUrl} alt="" className="w-20 h-20 rounded-2xl object-contain bg-white/10 border border-white/15" />
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-white/70 mb-2">{landing.name}</p>
                  <h1 className="text-3xl sm:text-4xl font-bold text-balance">{landing.headline || landing.name}</h1>
                  {landing.about && <p className="mt-4 text-sm sm:text-base text-white/80 max-w-xl leading-relaxed">{landing.about}</p>}
                </div>
              </div>
            </div>
          </section>
          )}

          {blocks.length > 0 && (
            <section className="max-w-3xl mx-auto px-4 sm:px-8 py-10 grid gap-4">
              {blocks.map((block, i) => (
                <article key={i} className="border border-surface-800 rounded-xl p-5 bg-surface-900">
                  {block.title && <h2 className="text-sm font-semibold mb-2">{block.title}</h2>}
                  {block.body && <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">{block.body}</p>}
                  {block.url && (
                    <a href={block.url} className="inline-flex items-center gap-1 text-xs text-brand-400 mt-3" target="_blank" rel="noreferrer">
                      <Globe className="w-3 h-3" /> Más info
                    </a>
                  )}
                </article>
              ))}
            </section>
          )}

          <section className="max-w-3xl mx-auto px-4 sm:px-8 pb-16">
            <div className="border border-surface-800 rounded-xl p-5 bg-surface-900 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              <p className="text-sm text-surface-300">¿Sos un comercio y querés trabajar con {landing.name}? Pedí un código de vinculación. En NODO la marca no se descubre sola.</p>
              <div className="flex flex-col gap-1 text-sm">
                {landing.websiteUrl && (
                  <a href={landing.websiteUrl} className="text-brand-400 inline-flex items-center gap-1.5" target="_blank" rel="noreferrer">
                    <Globe className="w-3.5 h-3.5" /> Sitio
                  </a>
                )}
                {landing.supportEmail && (
                  <a href={`mailto:${landing.supportEmail}`} className="text-surface-300 inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> {landing.supportEmail}
                  </a>
                )}
                {landing.supportPhone && (
                  <p className="text-surface-300 inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> {landing.supportPhone}
                  </p>
                )}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
