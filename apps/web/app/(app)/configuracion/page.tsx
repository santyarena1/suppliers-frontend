"use client";

import { useEffect, useState } from "react";
import { usePrefs, DollarType } from "@/lib/prefs";
import { knownIibbRatesHint, useIibbRatesEpoch } from "@/lib/iibb-rates";
import IibbRatesEditor from "@/components/IibbRatesEditor";
import { useTheme, THEME_OPTIONS, type Theme } from "@/lib/theme";
import { getUser, isAdmin } from "@/lib/auth";
import {
  AppearanceTab,
  BannersTab,
  BrandsTab,
  ProvidersTab,
} from "@/components/admin/SystemConfigPanels";
import {
  Settings, Palette, DollarSign, Receipt, Check, RefreshCw, Sun, Moon, Sparkles,
  Boxes, Building2, Image as ImageIcon, CheckCircle2, XCircle, Percent,
} from "lucide-react";

const THEME_ICONS: Record<Theme, React.ElementType> = {
  soft: Sparkles,
  dark: Moon,
  light: Sun,
};

type ConfigTab = "prefs" | "appearance" | "providers" | "brands" | "banners";

const ADMIN_TABS: { key: ConfigTab; label: string; icon: React.ReactNode }[] = [
  { key: "appearance", label: "Identidad", icon: <Palette className="w-3.5 h-3.5" /> },
  { key: "providers", label: "Proveedores", icon: <Boxes className="w-3.5 h-3.5" /> },
  { key: "brands", label: "Marcas", icon: <Building2 className="w-3.5 h-3.5" /> },
  { key: "banners", label: "Banners", icon: <ImageIcon className="w-3.5 h-3.5" /> },
];

export default function ConfiguracionPage() {
  const user = getUser();
  const admin = isAdmin();
  const [tab, setTab] = useState<ConfigTab>("prefs");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const { theme, setTheme } = useTheme();
  const {
    currency, setCurrency, withIva, setWithIva, withIibb, setWithIibb,
    dollarType, setDollarType, rates, currentRate, refreshRates, loadingRates, dollarLabel,
  } = usePrefs();
  useIibbRatesEpoch();
  const iibbHint = knownIibbRatesHint();

  useEffect(() => {
    if (!admin && tab !== "prefs") setTab("prefs");
  }, [admin, tab]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-600/15 border border-brand-500/25 flex items-center justify-center">
            <Settings className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Configuración</h1>
            <p className="text-xs text-surface-500">
              Apariencia y preferencias{admin ? " · ajustes generales del sistema" : ` de ${user?.username ?? "tu cuenta"}`}
            </p>
          </div>
        </div>
      </header>

      {admin && (
        <div className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 flex gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTab("prefs")}
            className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 border-b-2 -mb-px transition-all whitespace-nowrap ${
              tab === "prefs"
                ? "border-brand-500 text-brand-400"
                : "border-transparent text-surface-500 hover:text-surface-300"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Preferencias
          </button>
          {ADMIN_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2.5 border-b-2 -mb-px transition-all whitespace-nowrap ${
                tab === key
                  ? "border-brand-500 text-brand-400"
                  : "border-transparent text-surface-500 hover:text-surface-300"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto px-4 sm:px-6 py-6 ${tab === "prefs" ? "max-w-2xl" : "max-w-3xl"}`}>
          {tab === "prefs" && (
            <div className="flex flex-col gap-6">
              <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Palette className="w-4 h-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-white">Apariencia</h2>
                </div>
                <p className="text-xs text-surface-500 mb-4 leading-relaxed">
                  El modo Suave combina un fondo oscuro moderado con tarjetas de producto blancas.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {THEME_OPTIONS.map((opt) => {
                    const Icon = THEME_ICONS[opt.value];
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTheme(opt.value)}
                        className={`rounded-xl border p-4 text-left transition-all ${
                          active
                            ? "border-brand-500 bg-brand-600/10 ring-1 ring-brand-500/30"
                            : "border-surface-700 bg-surface-800/50 hover:border-surface-600"
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-2 ${active ? "text-brand-400" : "text-surface-400"}`} />
                        <p className="text-sm font-semibold text-white mb-1">{opt.label}</p>
                        <p className="text-[11px] text-surface-500 leading-snug">{opt.description}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">Moneda y cotizaciones</h2>
                  </div>
                  <button
                    type="button"
                    onClick={refreshRates}
                    disabled={loadingRates}
                    className="text-surface-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-surface-800"
                    title="Actualizar cotizaciones"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingRates ? "animate-spin" : ""}`} />
                  </button>
                </div>

                <div className="flex flex-col gap-5">
                  <div>
                    <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
                      Moneda de visualización
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["ARS", "USD"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-lg border transition-all ${
                            currency === c
                              ? "bg-brand-600/15 border-brand-500 text-brand-400"
                              : "border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600"
                          }`}
                        >
                          {currency === c && <Check className="w-3.5 h-3.5" />}
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
                      Tipo de dólar
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(["oficial", "blue", "mep", "tarjeta", "cripto", "mayorista"] as DollarType[]).map((t) => {
                        const r = rates.find((rt) => rt.type === t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDollarType(t)}
                            className={`flex flex-col items-start text-left text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                              dollarType === t
                                ? "bg-brand-600/15 border-brand-500 text-brand-400"
                                : "border-surface-700 text-surface-400 hover:text-surface-200 hover:border-surface-600"
                            }`}
                          >
                            <span className="font-semibold">{dollarLabel(t)}</span>
                            {r && (
                              <span className="text-[10px] text-surface-500 tabular-nums mt-0.5">
                                ${r.venta.toLocaleString("es-AR")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-2">
                      Impuestos en precios
                    </label>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setWithIva(!withIva)}
                        className="w-full flex items-center justify-between bg-surface-800 hover:bg-surface-700 border border-surface-700 rounded-xl px-4 py-3 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          <Receipt className="w-4 h-4 text-surface-400" />
                          <span className="text-sm text-surface-200">Mostrar precios con impuestos</span>
                        </div>
                        <div className={`w-9 h-5 rounded-full relative transition-colors ${withIva ? "bg-brand-600" : "bg-surface-600"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${withIva ? "left-4" : "left-0.5"}`} />
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setWithIibb(!withIibb)}
                        className={`w-full flex items-center justify-between border rounded-xl px-4 py-3 transition-all ${
                          withIva || withIibb
                            ? "bg-surface-800 hover:bg-surface-700 border-surface-700"
                            : "bg-surface-900/50 border-surface-800 opacity-70"
                        }`}
                        title={iibbHint}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Percent className="w-4 h-4 text-surface-400 flex-shrink-0" />
                          <div className="text-left min-w-0">
                            <span className="text-sm text-surface-200 block">Incluir percepciones / IIBB</span>
                            <span className="text-[11px] text-surface-500 leading-snug block mt-0.5">
                              {iibbHint || "Cargá la alícuota de cada distribuidor abajo."} Apagado por defecto.
                            </span>
                          </div>
                        </div>
                        <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${withIibb ? "bg-brand-600" : "bg-surface-600"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${withIibb ? "left-4" : "left-0.5"}`} />
                        </div>
                      </button>
                      <IibbRatesEditor />
                    </div>
                  </div>

                  {currentRate && (
                    <p className="text-[11px] text-surface-500 border-t border-surface-800 pt-3">
                      Cotización actualizada:{" "}
                      {new Date(currentRate.fechaActualizacion).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}

          {admin && tab === "appearance" && <AppearanceTab showToast={showToast} />}
          {admin && tab === "providers" && <ProvidersTab showToast={showToast} />}
          {admin && tab === "brands" && <BrandsTab showToast={showToast} />}
          {admin && tab === "banners" && <BannersTab showToast={showToast} />}
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl ${
            toast.ok
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-red-500/10 border-red-500/20 text-red-300"
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </>
  );
}
