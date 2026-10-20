"use client";

import { useState } from "react";
import { AlertTriangle, Download, ExternalLink, Layers, Loader2, RefreshCw, Sheet, Unlink } from "lucide-react";
import { storefrontApi, type MyStorefront, type StorefrontSheet } from "@/lib/api";
import { ago, apiError } from "@/lib/storefront";

const inputCls =
  "w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";

/**
 * Conectar una planilla de Google Sheets: NODO la lee cada 15 minutos y, si
 * cambió, la carga como si la hubieran subido (misma revisión y mismo revertir).
 */
export default function StorefrontSheetCard({
  sheet,
  onChange,
  onImported,
}: {
  sheet: StorefrontSheet | null;
  onChange: (next: MyStorefront) => void;
  onImported: () => void;
}) {
  const [url, setUrl] = useState("");
  const [working, setWorking] = useState<"link" | "sync" | "unlink" | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  async function link() {
    setWorking("link");
    setAviso(null);
    try {
      const res = await storefrontApi.linkSheet(url.trim());
      onChange(res.data.store);
      setUrl("");
      onImported();
      setAviso({ ok: true, text: "Planilla conectada. La estamos cargando: mirá el estado en las cargas de abajo." });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo conectar la planilla") });
    } finally {
      setWorking(null);
    }
  }

  async function sync() {
    setWorking("sync");
    setAviso(null);
    try {
      const res = await storefrontApi.syncSheet();
      onChange(res.data.store);
      if (res.data.changed) onImported();
      setAviso(
        res.data.error
          ? { ok: false, text: res.data.error }
          : { ok: true, text: res.data.changed ? "Cambió: la estamos cargando." : "Sin cambios desde la última vez." }
      );
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo sincronizar") });
    } finally {
      setWorking(null);
    }
  }

  async function unlink() {
    setWorking("unlink");
    setAviso(null);
    try {
      onChange((await storefrontApi.unlinkSheet()).data);
      setAviso({ ok: true, text: "Desconectada. Tus productos quedan como estaban." });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo desconectar") });
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sheet className="h-4 w-4 text-emerald-300" aria-hidden /> Sincronizar con Google Sheets
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-surface-400">
            Cargás tu stock en una planilla de Google y NODO la lee sola cada 15 minutos (o al toque con «Sincronizar ahora»).
            Precio, stock, estado, garantía, descripción y fotos: lo que cambies allá se actualiza acá, sin subir nada.
          </p>
        </div>
        <a
          href="/plantillas/tienda-nodo.csv"
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-100 hover:border-surface-500"
        >
          <Download className="h-3.5 w-3.5" /> Planilla de ejemplo
        </a>
      </div>

      {sheet ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-surface-800 bg-surface-950/40 px-3 py-2.5 text-xs">
            <a href={sheet.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-300 hover:text-brand-200">
              Tu planilla <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-surface-400">Revisada {ago(sheet.checkedAt)}</span>
            <span className="text-surface-400">Último cambio cargado {ago(sheet.changedAt)}</span>
          </div>
          {sheet.error && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              {sheet.error}
            </p>
          )}
          <SheetTabPicker
            key={`${sheet.tab ?? ""}-${sheet.tabs.length}`}
            sheet={sheet}
            disabled={working !== null}
            onChose={(res) => {
              onChange(res.store);
              if (res.changed) onImported();
              setAviso(
                res.error
                  ? { ok: false, text: res.error }
                  : res.changed
                    ? { ok: true, text: "Listo: estamos cargando esa pestaña. Mirá el estado en las cargas de abajo." }
                    : { ok: true, text: "Pestaña guardada. Hay una carga procesándose: la leemos apenas termine." }
              );
            }}
            onError={(text) => setAviso({ ok: false, text })}
          />
          <p className="text-[11px] leading-relaxed text-surface-400">
            Con la planilla conectada, la planilla manda: si cambiás un precio o un stock acá en NODO (o confirmás un pedido, que
            descuenta stock), anotalo también en la planilla, porque la próxima vez que la cambies se carga lo que dice ella. Las
            fotos que subiste en NODO quedan mientras la celda «Fotos» de ese producto esté vacía.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void sync()}
              disabled={working !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {working === "sync" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sincronizar ahora
            </button>
            <button
              type="button"
              onClick={() => void unlink()}
              disabled={working !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-300 hover:text-white disabled:opacity-50"
            >
              {working === "unlink" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <ol className="grid gap-2 text-xs leading-relaxed text-surface-300 sm:grid-cols-3">
            <li className="rounded-xl border border-surface-800 bg-surface-950/40 p-3">
              <span className="font-semibold text-white">1.</span> Bajá la planilla de ejemplo y abrila en Google Sheets
              (Archivo → Importar), o usá la tuya.
            </li>
            <li className="rounded-xl border border-surface-800 bg-surface-950/40 p-3">
              <span className="font-semibold text-white">2.</span> Compartir → Acceso general: <b>Cualquier persona con el enlace</b>,
              rol <b>Lector</b>. Copiá el enlace.
            </li>
            <li className="rounded-xl border border-surface-800 bg-surface-950/40 p-3">
              <span className="font-semibold text-white">3.</span> Pegalo acá. Si la planilla tiene varias pestañas, te
              mostramos cuál leemos y elegís la de productos. En «Fotos» podés poner varios links separados por espacio.
            </li>
          </ol>
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            Quien tenga el link puede ver esa planilla: poné solo lo que publicás (nada de costos, proveedores ni clientes). NODO
            solo la lee, nunca la modifica, y el link no se le muestra a los compradores.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className={`${inputCls} min-w-0 flex-1 basis-72`}
              inputMode="url"
            />
            <button
              type="button"
              onClick={() => void link()}
              disabled={working !== null || !url.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {working === "link" && <Loader2 className="h-4 w-4 animate-spin" />}
              Conectar
            </button>
          </div>
        </div>
      )}
      {aviso && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}
    </section>
  );
}

type ChooseResult = { changed: boolean; importId: string | null; error: string | null; store: MyStorefront };

const TAB_SOURCE_TEXT: Record<StorefrontSheet["tabSource"], string> = {
  MOST_ROWS: "la elegimos porque es la que más productos tiene",
  CHOSEN: "la elegiste vos",
  LINK: "es la del link que pegaste",
};

/** Qué pestaña de la planilla se lee y, si hay varias, cuál es la de productos. */
function SheetTabPicker({
  sheet,
  disabled,
  onChose,
  onError,
}: {
  sheet: StorefrontSheet;
  disabled: boolean;
  onChose: (res: ChooseResult) => void;
  onError: (text: string) => void;
}) {
  const current = sheet.tab;
  const exists = current != null && sheet.tabs.some((t) => t.name === current);
  const [picked, setPicked] = useState<string>(exists ? current! : (sheet.tabs.find((t) => t.rows > 0)?.name ?? ""));
  const [working, setWorking] = useState(false);
  const rows = sheet.tabs.find((t) => t.name === current)?.rows;

  async function choose() {
    if (!picked) return;
    setWorking(true);
    try {
      onChose((await storefrontApi.chooseSheetTab(picked)).data);
    } catch (err) {
      onError(apiError(err, "No se pudo leer esa pestaña"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-950/40 px-3 py-2.5 text-xs">
      <p className="flex items-start gap-2 text-surface-200">
        <Layers className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-300" aria-hidden />
        <span>
          {current ? (
            <>
              Leemos la pestaña <b className="text-white">«{current}»</b>
              {rows != null && ` (${rows} ${rows === 1 ? "fila" : "filas"} con datos)`}: {TAB_SOURCE_TEXT[sheet.tabSource]}.
            </>
          ) : (
            "Leemos la pestaña del link que pegaste."
          )}
          {sheet.tabs.length > 1 && ` Tu planilla tiene ${sheet.tabs.length} pestañas; si los productos están en otra, elegila.`}
        </span>
      </p>
      {sheet.tabs.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
          <label className="sr-only" htmlFor="sheet-tab">
            Pestaña de productos
          </label>
          <select
            id="sheet-tab"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
          >
            {sheet.tabs.map((t) => (
              <option key={t.name} value={t.name} disabled={t.rows === 0}>
                {t.name} · {t.rows > 0 ? `${t.rows} filas` : "sin tabla de productos"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void choose()}
            disabled={disabled || working || !picked || (picked === current && sheet.tabSource !== "LINK")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-3 py-1.5 text-xs font-semibold text-white hover:border-surface-400 disabled:opacity-50"
          >
            {working && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Leer esta pestaña
          </button>
        </div>
      )}
    </div>
  );
}
