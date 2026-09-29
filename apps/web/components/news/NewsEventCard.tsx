"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarDays, Check, Download, ExternalLink, Loader2, MapPin, Users, X } from "lucide-react";
import { newsApi, type NewsAttendee, type NewsEventInfo, type NewsRsvpSummary, type RsvpStatus } from "@/lib/api";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function formatEventWhen(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const day = start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const time = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (!endsAt) return `${day}, ${time(start)} h`;
  const end = new Date(endsAt);
  const sameDay = end.toDateString() === start.toDateString();
  return sameDay
    ? `${day}, ${time(start)} a ${time(end)} h`
    : `${day} ${time(start)} h al ${end.toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`;
}

function shortDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Recuadro del evento en la nota. `interactive` es la vista dentro de NODO (con
 * sesión); el link público solo informa. Quien organiza ve la asistencia y
 * manda avisos; el comercio vinculado confirma si va.
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

  useEffect(() => {
    if (!interactive || !event.rsvpEnabled) return;
    newsApi
      .rsvp(articleId)
      .then((res) => setRsvp(res.data))
      .catch(() => setRsvp(null));
  }, [articleId, interactive, event.rsvpEnabled]);

  const box = paper ? "border-[#ddd8cc] bg-[#f6f3ec] text-[#111]" : "border-white/10 bg-surface-900/70 text-white";
  const mute = paper ? "text-[#5c5c5c]" : "text-surface-400";
  const isAuthor = Boolean(rsvp?.attendees);

  return (
    <aside className={`mb-8 rounded-xl border ${box}`}>
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <p className="inline-flex items-center gap-2 text-base font-semibold first-letter:uppercase">
          <CalendarDays className="h-4 w-4 flex-shrink-0" />
          {formatEventWhen(event.startsAt, event.endsAt)}
        </p>
        {event.location && (
          <p className={`inline-flex items-center gap-2 text-sm ${mute}`}>
            <MapPin className="h-4 w-4 flex-shrink-0" /> {event.location}
          </p>
        )}
        {event.url && (
          <a href={event.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm underline underline-offset-4">
            <ExternalLink className="h-4 w-4 flex-shrink-0" /> Entrar al evento online
          </a>
        )}
        {event.rsvpEnabled && (event.capacity != null || event.rsvpDeadline) && (
          <p className={`text-sm ${mute}`}>
            {event.capacity != null ? `Cupo: ${event.capacity} personas` : ""}
            {event.capacity != null && event.rsvpDeadline ? " · " : ""}
            {event.rsvpDeadline ? `Confirmá hasta el ${shortDateTime(event.rsvpDeadline)} h` : ""}
          </p>
        )}
      </div>

      {interactive && event.rsvpEnabled && rsvp && (
        <div className={`border-t p-4 sm:p-5 ${paper ? "border-[#ddd8cc]" : "border-white/10"}`}>
          {isAuthor ? (
            <OrganizerPanel articleId={articleId} rsvp={rsvp} reminder={event.reminder ?? true} />
          ) : (
            <RsvpForm articleId={articleId} rsvp={rsvp} onChange={setRsvp} />
          )}
        </div>
      )}
    </aside>
  );
}

function RsvpForm({
  articleId,
  rsvp,
  onChange,
}: {
  articleId: string;
  rsvp: NewsRsvpSummary;
  onChange: (s: NewsRsvpSummary) => void;
}) {
  const mine = rsvp.myResponse;
  const [editing, setEditing] = useState(!mine);
  const [people, setPeople] = useState(mine?.people ?? 1);
  const [note, setNote] = useState(mine?.note ?? "");
  const [busy, setBusy] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(status: RsvpStatus) {
    setBusy(status);
    setError(null);
    try {
      const res = await newsApi.respond(articleId, { status, people, note: note.trim() || null });
      onChange(res.data);
      setEditing(false);
    } catch (err) {
      setError(errMsg(err, "No se pudo guardar tu respuesta"));
    } finally {
      setBusy(null);
    }
  }

  const spots =
    rsvp.spotsLeft != null ? ` · ${rsvp.spotsLeft === 0 ? "sin lugares" : `quedan ${rsvp.spotsLeft} lugares`}` : "";

  if (!editing && mine) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm">
          {mine.status === "GOING" ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" /> Confirmaste que van {mine.people}{" "}
              {mine.people === 1 ? "persona" : "personas"}
            </>
          ) : (
            <>
              <X className="h-4 w-4 text-surface-400" /> Avisaste que no van
            </>
          )}
        </p>
        {!rsvp.closedReason && (
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-brand-400 hover:text-brand-300">
            Cambiar respuesta
          </button>
        )}
      </div>
    );
  }

  if (rsvp.closedReason) {
    return <p className="text-sm text-surface-400">{rsvp.closedReason}.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        ¿Van a ir? <span className="font-normal text-surface-400">{rsvp.count} confirmados{spots}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="text-xs text-surface-400">
          Personas
          <select
            value={people}
            onChange={(e) => setPeople(Number(e.target.value))}
            className="mt-1 w-full rounded-lg bg-surface-950 px-2.5 py-2 text-sm text-white ring-1 ring-white/10"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-surface-400">
          Comentario (opcional)
          <input
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nombres, consultas, algo que la marca tenga que saber"
            className="mt-1 w-full rounded-lg bg-surface-950 px-2.5 py-2 text-sm text-white ring-1 ring-white/10 placeholder:text-surface-600"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void send("GOING")}
          disabled={busy !== null || rsvp.spotsLeft === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
        >
          {busy === "GOING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Voy
        </button>
        <button
          type="button"
          onClick={() => void send("NOT_GOING")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {busy === "NOT_GOING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} No voy
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function OrganizerPanel({ articleId, rsvp, reminder }: { articleId: string; rsvp: NewsRsvpSummary; reminder: boolean }) {
  const [list, setList] = useState<NewsAttendee[] | null>(null);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<"going" | "linked" | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggleList() {
    if (!open && !list) {
      try {
        const res = await newsApi.attendees(articleId);
        setList(res.data.items);
      } catch (err) {
        setAviso({ ok: false, text: errMsg(err, "No se pudo cargar la lista") });
        return;
      }
    }
    setOpen((v) => !v);
  }

  async function remind(audience: "going" | "linked") {
    setSending(audience);
    setAviso(null);
    try {
      const res = await newsApi.remind(articleId, audience);
      setAviso({
        ok: true,
        text:
          res.data.sent === 0
            ? "No había a quién avisar."
            : `Aviso enviado a ${res.data.sent} ${res.data.sent === 1 ? "organización" : "organizaciones"}.`,
      });
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo enviar el aviso") });
    } finally {
      setSending(null);
    }
  }

  function downloadCsv() {
    if (!list) return;
    const rows = [
      ["Organización", "Persona", "Email", "Respuesta", "Personas", "Comentario", "Respondió"],
      ...list.map((a) => [
        a.organization,
        a.person,
        a.email ?? "",
        a.status === "GOING" ? "Va" : "No va",
        String(a.people),
        a.note ?? "",
        new Date(a.answeredAt).toLocaleString("es-AR"),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "asistencia.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <Users className="h-4 w-4" /> {rsvp.count} {rsvp.count === 1 ? "persona confirmada" : "personas confirmadas"}
        </span>
        {rsvp.capacity != null && <span className="text-surface-400">Cupo {rsvp.capacity} · quedan {rsvp.spotsLeft}</span>}
        {rsvp.notGoing > 0 && <span className="text-surface-400">{rsvp.notGoing} no van</span>}
      </div>
      <p className="text-xs text-surface-500">
        {reminder
          ? "Recordatorio automático activado: 24 h antes les llega un aviso a los que confirmaron."
          : "Sin recordatorio automático."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void toggleList()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white ring-1 ring-white/10 hover:bg-white/10"
        >
          <Users className="h-4 w-4" /> {open ? "Ocultar lista" : "Ver lista de asistencia"}
        </button>
        <button
          type="button"
          onClick={() => void remind("going")}
          disabled={sending !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40"
        >
          {sending === "going" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Avisar a los que
          confirmaron
        </button>
        <button
          type="button"
          onClick={() => void remind("linked")}
          disabled={sending !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-white ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40"
        >
          {sending === "linked" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Avisar a
          todos mis comercios
        </button>
      </div>
      {aviso && <p className={`text-sm ${aviso.ok ? "text-emerald-300" : "text-red-400"}`}>{aviso.text}</p>}
      {open && list && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-white/10">
          {list.length === 0 ? (
            <p className="px-4 py-4 text-sm text-surface-400">Todavía nadie respondió.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-surface-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Organización</th>
                  <th className="px-3 py-2 font-medium">Persona</th>
                  <th className="px-3 py-2 font-medium">Respuesta</th>
                  <th className="px-3 py-2 text-right font-medium">Personas</th>
                  <th className="px-3 py-2 font-medium">Comentario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {list.map((a, i) => (
                  <tr key={`${a.person}-${i}`}>
                    <td className="px-3 py-2">{a.organization}</td>
                    <td className="px-3 py-2 text-surface-300">{a.person}</td>
                    <td className={`px-3 py-2 ${a.status === "GOING" ? "text-emerald-300" : "text-surface-400"}`}>
                      {a.status === "GOING" ? "Va" : "No va"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.status === "GOING" ? a.people : "—"}</td>
                    <td className="px-3 py-2 text-surface-300">{a.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.length > 0 && (
            <div className="border-t border-white/[0.06] px-3 py-2">
              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
              >
                <Download className="h-4 w-4" /> Descargar lista (CSV)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
