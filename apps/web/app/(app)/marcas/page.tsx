"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import RedeemAccessCode from "@/components/RedeemAccessCode";
import { getTenant } from "@/lib/auth";
import { brandApi, type RetailerBrandView } from "@/lib/api";
import { Building2, ChevronRight, CircleDot, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function MarcasHomePage() {
  const [brands, setBrands] = useState<RetailerBrandView[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const tenant = getTenant();
  const distro = tenant?.type === "DISTRIBUTOR";

  const load = useCallback(() => {
    return brandApi
      .linked()
      .then((res) => setBrands(res.data.brands))
      .catch((err) => setAviso(errMsg(err, "No se pudieron cargar las marcas")));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Marcas</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            {distro
              ? "Espacio de cada marca vinculada con este distribuidor. Canjeá un código para sumar otra."
              : "Espacio de cada marca con la que trabaja este local. Canjeá el código acá, no en Proveedores."}
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}
          <RedeemAccessCode onRedeemed={() => void load()} />
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : brands.length === 0 ? (
            <div className="text-center py-10 max-w-md mx-auto">
              <Building2 className="w-10 h-10 text-surface-600 mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-white mb-1">Todavía no hay marcas acá</h2>
              <p className="text-xs text-surface-400">
                Pedile el código a la marca (o a NODO) y canjealo arriba. Hasta entonces esa organización no existe
                para {distro ? "este distribuidor" : "este local"}.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {brands.map((brand) => (
                <Link
                  key={brand.linkId}
                  href={`/marcas/${brand.linkId}`}
                  className="border border-surface-800 hover:border-surface-600 rounded-xl p-4 bg-surface-900 flex flex-col gap-3 transition-colors"
                  style={brand.landing?.primaryColor ? { borderColor: `${brand.landing.primaryColor}55` } : undefined}
                >
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
                    <ChevronRight className="w-4 h-4 text-surface-600" />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-surface-500">
                    <span className="inline-flex items-center gap-1">
                      <CircleDot className="w-3 h-3" /> {brand.signalCount} en el mapa
                    </span>
                    <span>{brand.actions.length} acciones</span>
                  </div>
                </Link>
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
