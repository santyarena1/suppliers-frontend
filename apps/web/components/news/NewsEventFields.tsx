"use client";

import { useEffect, useState } from "react";
import { brandItemsApi, type BrandAvailabilityItem } from "@/lib/api";

const input = "mt-1 w-full bg-surface-900 border border-surface-800 px-2 py-2 text-sm text-white";

export interface EventDraft {
  eventStartsAt: string;
  eventEndsAt: string;
  eventLocation: string;
  eventUrl: string;
  rsvpEnabled: boolean;
  eventCapacity: string;
  rsvpDeadline: string;
  eventReminder: boolean;
}

/** Cuándo y dónde es el evento, y si los vinculados se pueden anotar. */
export function NewsEventFields({
  value,
  onChange,
}: {
  value: EventDraft;
  onChange: (patch: Partial<EventDraft>) => void;
}) {
  const endsBeforeStart =
    value.eventStartsAt && value.eventEndsAt && new Date(value.eventEndsAt) < new Date(value.eventStartsAt);
  return (
    <fieldset className="border border-surface-800 bg-surface-900/40 p-3 flex flex-col gap-3">
      <legend className="px-1 text-[12px] text-surface-300">Evento</legend>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-[12px] text-surface-500">
          Empieza *
          <input
            type="datetime-local"
            required
            className={input}
            value={value.eventStartsAt}
            onChange={(e) => onChange({ eventStartsAt: e.target.value })}
          />
        </label>
        <label className="text-[12px] text-surface-500">
          Termina
          <input
            type="datetime-local"
            className={input}
            value={value.eventEndsAt}
            onChange={(e) => onChange({ eventEndsAt: e.target.value })}
          />
        </label>
        <label className="text-[12px] text-surface-500">
          Lugar
          <input
            className={input}
            placeholder="Showroom, dirección, ciudad…"
            maxLength={200}
            value={value.eventLocation}
            onChange={(e) => onChange({ eventLocation: e.target.value })}
          />
        </label>
        <label className="text-[12px] text-surface-500">
          Link (online)
          <input
            type="url"
            className={input}
            placeholder="https://…"
            value={value.eventUrl}
            onChange={(e) => onChange({ eventUrl: e.target.value })}
          />
        </label>
      </div>
      {endsBeforeStart && <p className="text-[11px] text-red-400">Termina antes de empezar.</p>}
      <label className="flex items-start gap-2 text-sm text-surface-300">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.rsvpEnabled}
          onChange={(e) => onChange({ rsvpEnabled: e.target.checked })}
        />
        <span>
          Pedir confirmación de asistencia
          <span className="block text-[11px] text-surface-500">
            Cada comercio vinculado responde si va o no, cuántas personas y un comentario. Vos ves la lista completa.
          </span>
        </span>
      </label>
      {value.rsvpEnabled && (
        <div className="grid grid-cols-2 gap-4 pl-6">
          <label className="text-[12px] text-surface-500">
            Cupo (personas)
            <input
              type="number"
              min={1}
              className={input}
              placeholder="Sin límite"
              value={value.eventCapacity}
              onChange={(e) => onChange({ eventCapacity: e.target.value })}
            />
          </label>
          <label className="text-[12px] text-surface-500">
            Confirmar hasta
            <input
              type="datetime-local"
              className={input}
              value={value.rsvpDeadline}
              onChange={(e) => onChange({ rsvpDeadline: e.target.value })}
            />
          </label>
          <label className="col-span-2 flex items-start gap-2 text-sm text-surface-300">
            <input
              type="checkbox"
              className="mt-1"
              checked={value.eventReminder}
              onChange={(e) => onChange({ eventReminder: e.target.checked })}
            />
            <span>
              Recordatorio automático 24 h antes
              <span className="block text-[11px] text-surface-500">
                Les llega una notificación en NODO a quienes confirmaron que van.
              </span>
            </span>
          </label>
        </div>
      )}
      <p className="text-[11px] text-surface-500">
        El flyer: subilo como foto de portada o en la galería de fotos; se muestra entero. El link de la reunión solo
        lo ven los vinculados, nunca el link público.
      </p>
    </fieldset>
  );
}

/** Lanzamiento: a qué producto de la marca corresponde (sale en "Próximos lanzamientos"). */
export function NewsLaunchProductField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [items, setItems] = useState<BrandAvailabilityItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    brandItemsApi
      .list()
      .then((res) => setItems(res.data.items))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  const incoming = (items ?? []).filter((i) => i.state === "INCOMING");
  const others = (items ?? []).filter((i) => i.state !== "INCOMING");
  return (
    <label className="text-[12px] text-surface-500">
      Producto que se lanza
      <select className={input} value={value} disabled={!items} onChange={(e) => onChange(e.target.value)}>
        <option value="">{items ? "Ninguno" : "Cargando…"}</option>
        {incoming.length > 0 && (
          <optgroup label="Próximo ingreso">
            {incoming.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Otros productos">
            {others.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span className="block mt-1 text-[11px] text-surface-500">
        Si el producto está en “Próximo ingreso”, la nota aparece con él en tu espacio.
      </span>
    </label>
  );
}
