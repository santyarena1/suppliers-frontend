"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe2, Link2, Loader2, Lock, MessageCircle, Power, RefreshCw, Save, UserMinus } from "lucide-react";
import ComboField from "@/components/storefront/ComboField";
import ImagePicker from "@/components/storefront/ImagePicker";
import { warrantyOptions } from "@/components/storefront/warranty-options";
import { storefrontApi, type MyStorefront, type StorefrontAudienceList, type StorefrontSettingsInput } from "@/lib/api";
import {
  ago,
  apiError,
  DELIVERY_OPTION_LABEL,
  inviteUrl,
  INVOICE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  STOCK_DAY_OPTIONS,
} from "@/lib/storefront";

type StoreView = Extract<MyStorefront, { exists: true }>;

const inputCls =
  "w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none";
const cardCls = "rounded-2xl border border-surface-800 bg-surface-900 p-5";

type Aviso = { ok: boolean; text: string } | null;

function AvisoLine({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
  );
}

function Chips({ value, options, onChange }: { value: string[]; options: Record<string, string>; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(options).map(([key, label]) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== key) : [...value, key])}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
              on ? "border-brand-500 bg-brand-600/20 text-white" : "border-surface-700 text-surface-300 hover:border-surface-500 hover:text-white"
            }`}
          >
            {on && <Check className="h-3 w-3" aria-hidden />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Perfil público, condiciones de venta, stock, quién la ve y cerrar la tienda. */
export default function StorefrontSettings({ store, onChange }: { store: StoreView; onChange: (next: MyStorefront) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Primero lo que decide si te ven (se guarda al tocarlo); después el perfil, con su botón de guardar. */}
      <AudienceCard store={store} onChange={onChange} />
      <ProfileAndTerms store={store} onChange={onChange} />
      <CloseCard store={store} onChange={onChange} />
    </div>
  );
}

function ProfileAndTerms({ store, onChange }: { store: StoreView; onChange: (next: MyStorefront) => void }) {
  const initial = useCallback(
    () => ({
      displayName: store.displayName ?? "",
      about: store.about ?? "",
      logo: store.logoUrl ? [store.logoUrl] : [],
      phone: store.contactPhone ?? "",
      ordersEmail: store.ordersEmail ?? "",
      note: store.contactNote ?? "",
      paymentMethods: store.paymentMethods,
      deliveryOptions: store.deliveryOptions,
      invoiceTypes: store.invoiceTypes,
      defaultWarranty: store.defaultWarranty ?? "",
      salesTerms: store.salesTerms ?? "",
      sellsOffline: store.sellsOffline,
      stockValidDays: store.stockValidDays,
      staleAction: store.staleAction,
    }),
    [store]
  );
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const set = <K extends keyof ReturnType<typeof initial>>(key: K, value: ReturnType<typeof initial>[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setAviso(null);
    const body: StorefrontSettingsInput = {
      displayName: form.displayName.trim() || null,
      about: form.about.trim() || null,
      logoUrl: form.logo[0] ?? null,
      contactPhone: form.phone.trim() || null,
      ordersEmail: form.ordersEmail.trim() || null,
      contactNote: form.note.trim() || null,
      paymentMethods: form.paymentMethods,
      deliveryOptions: form.deliveryOptions,
      invoiceTypes: form.invoiceTypes,
      defaultWarranty: form.defaultWarranty.trim() || null,
      salesTerms: form.salesTerms.trim() || null,
      sellsOffline: form.sellsOffline,
      stockValidDays: form.stockValidDays,
      staleAction: form.staleAction,
    };
    try {
      const res = await storefrontApi.update(body);
      onChange(res.data);
      setAviso({ ok: true, text: "Guardado. Los compradores ya lo ven así." });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo guardar") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className={cardCls}>
        <h2 className="text-sm font-semibold text-white">Cómo te ven</h2>
        <p className="mt-1 text-xs leading-relaxed text-surface-400">
          Nombre y logo con los que aparecés en el buscador de los comercios que ven tu tienda, en su filtro de distribuidores y
          en sus pedidos. La presentación la leen cuando les ofrecemos tu tienda, antes de aceptarla.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto,1fr]">
          <ImagePicker value={form.logo} onChange={(v) => set("logo", v)} max={1} label="Logo" />
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-surface-400">
              Nombre público
              <input
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                maxLength={60}
                placeholder={store.orgName}
                className={inputCls}
              />
              <span className="text-surface-500">Vacío: se usa el nombre de tu comercio ({store.orgName}).</span>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-surface-400">
              Presentación
              <textarea
                value={form.about}
                onChange={(e) => set("about", e.target.value)}
                rows={2}
                maxLength={1500}
                placeholder="Sobrantes de stock, usados probados y armado de PC. Atendemos gremio."
                className={inputCls}
              />
            </label>
          </div>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-sm font-semibold text-white">Contacto y condiciones de venta</h2>
        <p className="mt-1 text-xs leading-relaxed text-surface-400">
          Lo ven los compradores en la ficha de cada producto tuyo, antes de pedir. No cambia precios ni stock: les dice cómo te
          contactan, cómo pagan, cómo les llega y qué factura les hacés.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Teléfono / WhatsApp
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} placeholder="11 5555-5555" className={inputCls} />
            <span className="text-surface-500">Los compradores lo ven como botón de WhatsApp en tu ficha.</span>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Mail para recibir los pedidos
            <input
              type="email"
              value={form.ordersEmail}
              onChange={(e) => set("ordersEmail", e.target.value)}
              maxLength={200}
              placeholder="pedidos@tulocal.com"
              className={inputCls}
            />
            <span className="text-surface-500">Solo lo usa NODO para avisarte (no lo ven los compradores). Vacío: al dueño y administradores.</span>
          </label>
          <ComboField
            label="Garantía para todos los productos (elegí una o creá otra)"
            value={form.defaultWarranty}
            onChange={(v) => set("defaultWarranty", v)}
            options={warrantyOptions([])}
            maxLength={300}
            placeholder="3 meses en el local. Cada producto puede decir otra."
            newLabel="Crear garantía"
          />
          <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-surface-400">
            Zona, retiro y horarios
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Retiro en Palermo, lunes a viernes de 10 a 18. Envíos por moto en CABA."
              className={inputCls}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[11px] text-surface-400">
            Formas de pago
            <Chips value={form.paymentMethods} options={PAYMENT_METHOD_LABEL} onChange={(v) => set("paymentMethods", v)} />
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] text-surface-400">
            Entrega
            <Chips value={form.deliveryOptions} options={DELIVERY_OPTION_LABEL} onChange={(v) => set("deliveryOptions", v)} />
          </div>
          <div className="flex flex-col gap-1.5 text-[11px] text-surface-400">
            Facturación
            <Chips value={form.invoiceTypes} options={INVOICE_TYPE_LABEL} onChange={(v) => set("invoiceTypes", v)} />
          </div>
          <label className="flex items-start gap-2.5 rounded-xl border border-surface-800 bg-surface-950/40 p-3 text-xs text-surface-200">
            <input
              type="checkbox"
              checked={form.sellsOffline}
              onChange={(e) => set("sellsOffline", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-500"
            />
            <span>
              También vendo estos productos fuera de NODO (local, web, Mercado Libre)
              <span className="mt-0.5 block text-[11px] text-surface-500">
                El comprador ve que el stock lo confirmás al recibir el pedido, y te recordamos actualizarlo.
              </span>
            </span>
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-surface-400">
            Otras condiciones
            <textarea
              value={form.salesTerms}
              onChange={(e) => set("salesTerms", e.target.value)}
              rows={3}
              maxLength={3000}
              placeholder="Seña del 30% para reservar. Sin cambios en usados. Compra mínima US$ 100."
              className={inputCls}
            />
          </label>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-sm font-semibold text-white">Stock</h2>
        <p className="mt-1 text-xs leading-relaxed text-surface-400">
          Cada cuánto te pedimos que confirmes que el stock está al día (te avisamos en NODO y por mail), y qué pasa si no lo
          confirmás. Subir una planilla o tocar «Mi stock está al día» lo confirma.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] text-surface-400">
            Recordarme confirmar el stock
            <select value={form.stockValidDays} onChange={(e) => set("stockValidDays", Number(e.target.value))} className={inputCls}>
              {STOCK_DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1.5 text-[11px] text-surface-400" disabled={form.stockValidDays === 0}>
            <legend className="mb-1">Si no lo confirmo a tiempo</legend>
            {(
              [
                ["KEEP", "Seguir mostrando la tienda", "Los compradores ven que el stock no está confirmado."],
                ["HIDE", "Ocultar la tienda", "Nadie la ve hasta que confirmes."],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 ${
                  form.staleAction === value ? "border-brand-500 bg-brand-600/10" : "border-surface-800"
                } ${form.stockValidDays === 0 ? "opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="staleAction"
                  checked={form.staleAction === value}
                  onChange={() => set("staleAction", value)}
                  className="mt-0.5 accent-brand-500"
                />
                <span>
                  <span className="block text-xs text-surface-100">{title}</span>
                  <span className="text-surface-500">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-surface-800 bg-surface-950/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </button>
        <button type="button" onClick={() => setForm(initial())} className="text-xs text-surface-400 hover:text-white">
          Descartar
        </button>
        {aviso && (
          <span className={`text-xs ${aviso.ok ? "text-emerald-300" : "text-red-300"}`} role="status">
            {aviso.text}
          </span>
        )}
      </div>
    </>
  );
}

function AudienceCard({ store, onChange }: { store: StoreView; onChange: (next: MyStorefront) => void }) {
  const [list, setList] = useState<StorefrontAudienceList | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const link = store.inviteToken ? inviteUrl(store.inviteToken) : null;

  const load = useCallback(async () => {
    try {
      setList((await storefrontApi.audience()).data);
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo cargar quién ve tu tienda") });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, store.reach]);

  async function setVisibility(visibility: "PUBLIC" | "PRIVATE") {
    if (visibility === store.visibility) return;
    setWorking("visibility");
    setAviso(null);
    try {
      onChange((await storefrontApi.update({ visibility })).data);
      setAviso({
        ok: true,
        text:
          visibility === "PRIVATE"
            ? "Ahora es privada: solo entran los que tengan tu link. Los que ya la veían la siguen viendo."
            : "Ahora es pública: se la ofrecemos a todos los comercios de NODO.",
      });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo cambiar") });
    } finally {
      setWorking(null);
    }
  }

  async function regenerate() {
    setWorking("link");
    setAviso(null);
    try {
      onChange((await storefrontApi.regenerateInvite()).data);
      setAviso({ ok: true, text: "Link nuevo. El anterior ya no sirve (los que entraron con él siguen viéndote)." });
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo generar el link") });
    } finally {
      setWorking(null);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setAviso({ ok: false, text: "No se pudo copiar. Seleccioná el link y copialo a mano." });
    }
  }

  async function remove(tenantId: string, name: string) {
    setWorking(tenantId);
    setAviso(null);
    try {
      await storefrontApi.removeBuyer(tenantId);
      setAviso({ ok: true, text: `${name} ya no ve tu tienda. Solo vuelve si le pasás el link.` });
      await load();
      onChange((await storefrontApi.mine()).data);
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo sacar") });
    } finally {
      setWorking(null);
    }
  }

  const share = link ? `https://wa.me/?text=${encodeURIComponent(`Mirá lo que vendo en NODO: ${link}`)}` : null;

  return (
    <section className={cardCls}>
      <h2 className="text-sm font-semibold text-white">Quién ve tu tienda</h2>
      <p className="mt-1 text-xs leading-relaxed text-surface-400">
        A quién le aparecen tus productos en el buscador. Cambiarlo no le saca la tienda a los comercios que ya la ven.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(
          [
            [
              "PUBLIC",
              Globe2,
              "Pública",
              "Se la ofrecemos a todos los comercios de NODO con un aviso y la ve cada uno que acepta. Se ofrece cuando la tienda está abierta y tiene productos con stock.",
            ],
            ["PRIVATE", Lock, "Privada", "Solo la ven los comercios a los que les pases tu link de invitación."],
          ] as const
        ).map(([value, Icon, title, hint]) => (
          <button
            key={value}
            type="button"
            onClick={() => void setVisibility(value)}
            disabled={working !== null}
            aria-pressed={store.visibility === value}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
              store.visibility === value ? "border-brand-500 bg-brand-600/10" : "border-surface-800 hover:border-surface-600"
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-300" aria-hidden />
            <span>
              <span className="block text-sm font-semibold text-white">{title}</span>
              <span className="text-[11px] leading-relaxed text-surface-400">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      {link && (
        <div className="mt-4 rounded-xl border border-surface-800 bg-surface-950/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Link2 className="h-3.5 w-3.5 text-brand-300" aria-hidden /> Link de invitación
          </p>
          <p className="mt-0.5 text-[11px] text-surface-500">
            Sirve con la tienda pública o privada: quien lo abre (con su cuenta de NODO) la ve sin esperar la propuesta.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${inputCls} min-w-0 flex-1 basis-64 py-1.5 text-xs`} />
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs text-surface-100 hover:border-surface-500"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            {share && (
              <a
                href={share}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => void regenerate()}
              disabled={working !== null}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-surface-400 hover:text-white disabled:opacity-50"
              title="El link anterior deja de funcionar"
            >
              {working === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Generar otro
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs text-surface-300">
          <span className="font-semibold text-white">{list?.accepted.length ?? store.audience.accepted}</span> comercios la ven
          {store.visibility === "PUBLIC" && list ? (
            <span className="text-surface-500">
              {" "}
              · {list.pending} todavía no eligieron · {list.declined} prefirieron no verla
            </span>
          ) : null}
        </p>
        {list && list.accepted.length > 0 && (
          <ul className="mt-2 divide-y divide-surface-800 rounded-xl border border-surface-800">
            {list.accepted.map((a) => (
              <li key={a.tenantId} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{a.name}</p>
                  <p className="text-[11px] text-surface-500">
                    {a.source === "INVITE" ? "Entró con tu link" : "Aceptó la propuesta"} · {ago(a.since)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(a.tenantId, a.name)}
                  disabled={working !== null}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-surface-400 hover:bg-surface-800 hover:text-red-300 disabled:opacity-50"
                >
                  {working === a.tenantId ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                  Sacar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <AvisoLine aviso={aviso} />
    </section>
  );
}

function CloseCard({ store, onChange }: { store: StoreView; onChange: (next: MyStorefront) => void }) {
  const [asking, setAsking] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [working, setWorking] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  if (store.status === "SUSPENDED") return null;

  async function close() {
    setWorking(true);
    setAviso(null);
    try {
      onChange((await storefrontApi.close(wipe)).data);
      setAsking(false);
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudo cerrar la tienda") });
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={`${cardCls} border-red-500/20`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Power className="h-4 w-4 text-red-300" aria-hidden /> Cerrar la tienda
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-surface-400">
        Deja de verse y los pedidos sin responder se rechazan avisándole al comprador. La podés volver a abrir cuando quieras,
        las veces que quieras. Para frenarla un rato sin rechazar pedidos, usá «Pausar» en el resumen.
      </p>
      {asking ? (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <label className="flex items-start gap-2 text-xs text-surface-200">
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-500" />
            <span>
              Borrar también mis {store.productCount} productos y sus fotos
              <span className="block text-[11px] text-surface-500">Si lo dejás sin marcar, al reabrir vuelven tal cual.</span>
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void close()}
              disabled={working}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              Cerrar tienda
            </button>
            <button type="button" onClick={() => setAsking(false)} className="rounded-lg border border-surface-700 px-4 py-2 text-sm text-surface-300 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-3 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
        >
          Cerrar la tienda…
        </button>
      )}
      <AvisoLine aviso={aviso} />
    </section>
  );
}
