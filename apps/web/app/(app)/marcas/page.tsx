"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { brandApi, type RetailerBrandView } from "@/lib/api";
import { Building2, ChevronRight, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function MarcasHomePage() {
  const [brands, setBrands] = useState<RetailerBrandView[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    brandApi
      .linked()
      .then((res) => setBrands(res.data.brands))
      .catch((err) => setAviso(errMsg(err, "No se pudieron cargar las marcas")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Marcas</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Solo las marcas con las que tu comercio está vinculado. El resto no aparecen.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : brands.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <Building2 className="w-10 h-10 text-surface-600 mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-white mb-1">Sin marcas vinculadas</h2>
              <p className="text-xs text-surface-400">
                Canjeá el código que te dio la marca en Proveedores. Hasta entonces esa organización no existe para este local.
              </p>
              <Link href="/proveedores" className="inline-block mt-4 text-sm text-brand-400">
                Ir a Proveedores →
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {brands.map((brand) => (
                <article key={brand.linkId} className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {brand.landing?.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.landing.logoUrl} alt="" className="w-11 h-11 rounded-lg object-contain bg-white/5" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-brand-600/20 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-brand-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{brand.name}</p>
                      <p className="text-[11px] text-surface-500 truncate">{brand.landing?.headline || "Marca vinculada"}</p>
                    </div>
                    {brand.landing?.published && (
                      <a href={`/m/${brand.landing.publicKey}`} target="_blank" rel="noreferrer" className="text-[11px] text-brand-400">
                        Landing
                      </a>
                    )}
                    <Link href={`/mensajes?linkId=${brand.linkId}`} className="text-[11px] text-brand-400">
                      Hablar
                    </Link>
                  </div>
                  {brand.actions.length === 0 ? (
                    <p className="text-xs text-surface-500">Sin acciones vigentes para este local.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {brand.actions.map((action) => (
                        <li key={action.id}>
                          <p className="text-xs text-surface-200">{action.title}</p>
                          <div className="h-1 rounded-full bg-surface-800 overflow-hidden mt-1">
                            <div
                              className={`h-full ${action.progress.met ? "bg-emerald-500" : "bg-brand-500"}`}
                              style={{ width: `${Math.round(action.progress.ratio * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-surface-500 mt-0.5 tabular-nums">
                            {action.kind === "PURCHASE_AMOUNT"
                              ? `${action.progress.current.toFixed(0)} / ${action.progress.target ?? "—"} USD`
                              : `${action.progress.current} / ${action.progress.target ?? "—"} u.`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
          <Link href="/avisos" className="text-xs text-brand-400 inline-flex items-center gap-1">
            Ver avisos <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </>
  );
}
