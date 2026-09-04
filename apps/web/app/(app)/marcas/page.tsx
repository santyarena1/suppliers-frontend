"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import RedeemAccessCode from "@/components/RedeemAccessCode";
import AddSupplierDialog from "@/components/list-import/AddSupplierDialog";
import { Plus as PlusIcon } from "lucide-react";
import { getTenant } from "@/lib/auth";
import { assetUrl } from "@/lib/assets";
import { brandApi, type BrandModuleId, type RetailerBrandView } from "@/lib/api";
import { BRAND_MODULE_LABELS } from "@/lib/brand-presence";
import {
  Bell,
  Building2,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const MODULE_ORDER: BrandModuleId[] = ["products", "actions", "materials", "trainings", "contact", "space"];

export default function MarcasHomePage() {
  const [brands, setBrands] = useState<RetailerBrandView[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
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

  const pending = brands.filter((b) => b.presence.pending).length;
  const ready = brands.length - pending;
  const unread = brands.reduce((n, b) => n + (b.unreadNotices ?? 0), 0);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-white">Marcas conectadas</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            {distro
              ? "Espacio de cada marca vinculada con este distribuidor."
              : "Todo lo que podés hacer con las marcas de este local: productos, acciones, materiales y hablar."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!distro && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-brand-500 text-surface-200 hover:text-white rounded-lg px-3 py-1.5 transition-all"
            >
              <PlusIcon className="w-3.5 h-3.5" /> Agregar marca
            </button>
          )}
          <PrefsPanel />
        </div>
      </header>
      <AddSupplierDialog open={addOpen} onClose={() => setAddOpen(false)} kind="brand" onConnected={() => void load()} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
          {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}

          {!loading && brands.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Conectadas" value={String(brands.length)} />
              <Stat label="Con contenido" value={String(ready)} />
              <Stat label="Pendientes" value={String(pending)} tone={pending ? "amber" : undefined} />
              <Link href="/avisos" className="bg-surface-900 border border-surface-800 rounded-xl p-4 hover:border-surface-600 transition-colors">
                <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1">
                  <Bell className="w-3 h-3" /> Avisos
                </p>
                <p className="text-2xl font-bold text-white tabular-nums mt-1">{unread}</p>
                <p className="text-[11px] text-surface-500 mt-1">Sin leer</p>
              </Link>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-surface-500 mb-2">Sumar una marca</p>
            <RedeemAccessCode purpose="brand" onRedeemed={() => void load()} />
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : brands.length === 0 ? (
            <div className="text-center py-12 max-w-md mx-auto">
              <Building2 className="w-10 h-10 text-surface-600 mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-white mb-1">Todavía no hay marcas conectadas</h2>
              <p className="text-xs text-surface-400">
                El código lo da la marca. Hasta canjearlo, esa organización no existe para{" "}
                {distro ? "este distribuidor" : "este local"}.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {brands.map((brand) => (
                <BrandCard key={brand.linkId} brand={brand} distro={distro} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function BrandCard({ brand, distro }: { brand: RetailerBrandView; distro: boolean }) {
  const accent = brand.landing?.primaryColor || "#22c55e";
  const pending = brand.presence.pending;
  const connected = useMemo(
    () =>
      brand.connectedAt
        ? new Date(brand.connectedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })
        : null,
    [brand.connectedAt]
  );

  return (
    <Link
      href={`/marcas/${brand.linkId}`}
      className="group relative overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 hover:border-surface-600 transition-colors flex flex-col"
    >
      <div
        className="absolute inset-x-0 top-0 h-24 opacity-40"
        style={{ background: `linear-gradient(135deg, ${accent}55, transparent 70%)` }}
      />
      <div className="relative p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start gap-3">
          {brand.landing?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(brand.landing.logoUrl)}
              alt=""
              className="w-14 h-14 rounded-xl object-contain bg-white/10 border border-white/10"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-surface-800 border border-surface-700 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-brand-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-white truncate">{brand.name}</h2>
              {brand.status === "SUSPENDED" ? (
                <Chip tone="red">En pausa</Chip>
              ) : pending ? (
                <Chip tone="amber">
                  <Clock className="w-3 h-3" /> Pendiente
                </Chip>
              ) : (
                <Chip tone="emerald">
                  <Check className="w-3 h-3" /> Conectada
                </Chip>
              )}
            </div>
            <p className="text-xs text-surface-400 mt-1 line-clamp-2">
              {brand.landing?.headline || brand.landing?.about || "Marca vinculada a este local"}
            </p>
            {connected && <p className="text-[11px] text-surface-600 mt-1">Desde {connected}</p>}
          </div>
          <ChevronRight className="w-4 h-4 text-surface-600 group-hover:text-white mt-1" />
        </div>

        {pending ? (
          <p className="text-xs text-amber-200/80 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            El vínculo ya está. {brand.name} todavía no cargó productos, materiales ni acciones. Entras igual: lo
            que falte se ve como pendiente.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {MODULE_ORDER.map((id) => {
              const mod = brand.presence.modules[id];
              return (
                <span
                  key={id}
                  className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
                    mod.ready
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-surface-700 text-surface-500"
                  }`}
                >
                  {BRAND_MODULE_LABELS[id]}
                  {mod.ready && mod.count > 1 ? ` ${mod.count}` : ""}
                </span>
              );
            })}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between text-[11px] text-surface-500 pt-1">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-brand-400" />
            {distro ? "Ver espacio" : "Entrar · comprar · hablar"}
          </span>
          {brand.unreadNotices > 0 && (
            <span className="text-brand-400 font-semibold">{brand.unreadNotices} avisos</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-xl p-4">
      <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${tone === "amber" ? "text-amber-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "amber" | "emerald" | "red" }) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : tone === "red"
        ? "bg-red-500/15 text-red-300 border-red-500/30"
        : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${cls}`}>
      {children}
    </span>
  );
}
