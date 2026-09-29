"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Package, Rocket, Users } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import type { BrandLaunch, BrandUpcomingEvent } from "@/lib/api";
import { formatReferencePrice } from "@/components/brands/BrandAvailability";
import { formatEventWhen } from "@/components/news/NewsEventCard";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

/**
 * Lo que viene de la marca: productos por ingresar (con su material) y eventos.
 * No se pinta si no hay nada: no es un módulo "pendiente", es novedad.
 */
export function BrandUpcoming({
  name,
  launches,
  events,
}: {
  name: string;
  launches: BrandLaunch[];
  events: BrandUpcomingEvent[];
}) {
  if (launches.length === 0 && events.length === 0) return null;
  return (
    <section id="lanzamientos" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 w-full">
      <div className="mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Lanzamientos y eventos</h2>
        <p className="text-sm text-surface-400 mt-1">Productos que están por llegar y eventos de {name}.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {launches.length > 0 && (
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-sky-300 mb-3">
              <Rocket className="w-3.5 h-3.5" /> Próximos lanzamientos
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {launches.map((launch) => (
                <LaunchCard key={launch.id} launch={launch} />
              ))}
            </ul>
          </div>
        )}
        {events.length > 0 && (
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-amber-300 mb-3">
              <CalendarDays className="w-3.5 h-3.5" /> Eventos
            </p>
            <ul className="flex flex-col gap-3">
              {events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function LaunchCard({ launch }: { launch: BrandLaunch }) {
  const price = formatReferencePrice(launch.referencePrice, launch.currency);
  const body = (
    <>
      <div className="relative aspect-[4/3] bg-black/40">
        {launch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(launch.imageUrl)} alt="" className="w-full h-full object-contain p-3" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-white/25" />
          </div>
        )}
        {launch.incomingAt && (
          <span className="absolute top-2 left-2 rounded-full bg-sky-500/90 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Llega el {shortDate(launch.incomingAt)}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-white line-clamp-2">{launch.name}</p>
        <p className="text-[11px] text-surface-400 mt-1">
          {price ? `Precio ref. ${price}` : "Precio a confirmar"}
          {launch.partNumber ? ` · ${launch.partNumber}` : ""}
        </p>
        {launch.note && <p className="text-xs text-sky-300 mt-2 font-semibold">Ver presentación y material →</p>}
      </div>
    </>
  );
  const cls = "block rounded-2xl overflow-hidden border border-sky-500/25 bg-surface-900 hover:border-sky-400/60 transition-colors";
  return (
    <li>
      {launch.note ? (
        <Link href={launch.note.path} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function EventRow({ event }: { event: BrandUpcomingEvent }) {
  return (
    <li>
      <Link
        href={event.path}
        className="flex gap-3 rounded-2xl border border-amber-500/25 bg-surface-900 p-3 hover:border-amber-400/60 transition-colors"
      >
        {event.startsAt && (
          <span className="flex-shrink-0 w-14 rounded-xl bg-amber-500/15 text-center py-1.5">
            <span className="block text-lg font-semibold text-white leading-none">
              {new Date(event.startsAt).getDate()}
            </span>
            <span className="block text-[10px] uppercase text-amber-200 mt-0.5">
              {new Date(event.startsAt).toLocaleDateString("es-AR", { month: "short" })}
            </span>
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white">{event.title}</span>
          {event.startsAt && (
            <span className="block text-[11px] text-surface-400 mt-0.5 first-letter:uppercase">
              {formatEventWhen(event.startsAt, event.endsAt)}
            </span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1 text-[11px] text-surface-400 mt-0.5">
              <MapPin className="w-3 h-3" /> {event.location}
            </span>
          )}
          {event.rsvpEnabled && (
            <span className="flex items-center gap-1 text-[11px] text-amber-200 mt-1">
              <Users className="w-3 h-3" />
              {event.attending > 0 ? `${event.attending} anotados · ` : ""}Anotate en la nota
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
