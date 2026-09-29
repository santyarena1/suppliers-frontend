"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, ExternalLink, Loader2, MapPin, Users } from "lucide-react";
import { newsApi, type NewsEventInfo, type NewsRsvpSummary } from "@/lib/api";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function formatEventWhen(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const day = start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const time = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (!endsAt) return `${day}, ${time(start)} h`;
  const end = new Date(endsAt);
  const sameDay = end.toDateString() === start.toDateString();
  return sameDay
    ? `${day}, ${time(start)} a ${time(end)} h`
    : `${day} ${time(start)} h al ${end.toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`;
}

/**
 * Recuadro del evento en la nota: cuándo, dónde, link y "Me anoto".
 * `interactive` es la vista dentro de NODO (con sesión); el link público solo informa.
 */
export default function NewsEventCard({
  articleId,
  event,
  interactive,
  paper,
}: {
  articleId: string;
  event: NewsEventInfo;
  interactive: boolean;
  paper?: boolean;
}) {
  const [rsvp, setRsvp] = useState<NewsRsvpSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Se calcula una vez al montar: la página no queda abierta horas esperando el evento.
  const [started] = useState(() => new Date(event.startsAt).getTime() < Date.now());

  useEffect(() => {
    if (!interactive || !event.rsvpEnabled) return;
    newsApi
      .rsvp(articleId)
      .then((res) => setRsvp(res.data))
      .catch(() => setRsvp(null));
  }, [articleId, interactive, event.rsvpEnabled]);

  async function toggle() {
    if (!rsvp) return;
    setBusy(true);
    setError(null);
    try {
      const res = rsvp.mine ? await newsApi.leave(articleId) : await newsApi.join(articleId);
      setRsvp(res.data);
    } catch (err) {
      setError(errMsg(err, "No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  }

  const box = paper ? "border-[#ddd8cc] bg-[#f6f3ec] text-[#111]" : "border-surface-700 bg-surface-900 text-white";
  const mute = paper ? "text-[#5c5c5c]" : "text-surface-400";
  const isAuthor = Boolean(rsvp?.attendees);

  return (
    <aside className={`mb-8 border p-4 sm:p-5 ${box}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-semibold capitalize">
            <CalendarDays className="w-4 h-4 flex-shrink-0" />
            {formatEventWhen(event.startsAt, event.endsAt)}
          </p>
          {event.location && (
            <p className={`inline-flex items-center gap-2 text-sm ${mute}`}>
              <MapPin className="w-4 h-4 flex-shrink-0" />
              {event.location}
            </p>
          )}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm underline underline-offset-4"
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              Entrar al evento online
            </a>
          )}
        </div>

        {interactive && event.rsvpEnabled && rsvp && !isAuthor && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={toggle}
              disabled={busy || (started && !rsvp.mine)}
              aria-pressed={rsvp.mine}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                rsvp.mine
                  ? "border border-emerald-500/60 text-emerald-300"
                  : "bg-brand-600 text-white hover:bg-brand-500"
              }`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : rsvp.mine ? <Check className="w-4 h-4" /> : null}
              {rsvp.mine ? "Anotado · No voy" : started ? "Ya empezó" : "Me anoto"}
            </button>
            <span className={`text-[11px] ${mute}`}>
              {rsvp.count} {rsvp.count === 1 ? "anotado" : "anotados"}
            </span>
          </div>
        )}
      </div>

      {isAuthor && rsvp && (
        <div className={`mt-4 pt-3 border-t ${paper ? "border-[#ddd8cc]" : "border-surface-800"}`}>
          <p className="inline-flex items-center gap-2 text-xs font-semibold">
            <Users className="w-3.5 h-3.5" />
            {rsvp.count} {rsvp.count === 1 ? "persona anotada" : "personas anotadas"}
          </p>
          {rsvp.attendees && rsvp.attendees.length > 0 && (
            <ul className={`mt-2 flex flex-col gap-1 text-xs ${mute}`}>
              {rsvp.attendees.map((a) => (
                <li key={a.tenantId}>
                  {a.name} · {a.people} {a.people === 1 ? "persona" : "personas"}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </aside>
  );
}
