"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, Package, Users } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import type { BrandLaunch, BrandUpcomingEvent } from "@/lib/api";
import { formatReferencePrice } from "@/components/brands/BrandAvailability";
import { formatEventWhen } from "@/components/news/NewsEventCard";
import { BrandSection, SURFACE } from "@/components/brands/landing/Section";

function dayMonth(iso: string) {
  const d = new Date(iso);
  return {
    day: d.getDate(),
    month: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", ""),
  };
}

/**
 * Lo que viene de la marca: productos por llegar (con su presentación) y
 * eventos. Dos listas del mismo alto de fila; si hay una sola, ocupa todo.
 */
export function BrandUpcoming({
  name,
  launches,
  events,
  index,
}: {
  name: string;
  launches: BrandLaunch[];
  events: BrandUpcomingEvent[];
  index?: number;
}) {
  if (launches.length === 0 && events.length === 0) return null;
  const both = launches.length > 0 && events.length > 0;
  return (
    <BrandSection
      id="lanzamientos"
      index={index}
      title="Lanzamientos y eventos"
      description={`Productos que están por llegar y eventos de ${name}.`}
    >
      <div className={`grid gap-4 ${both ? "lg:grid-cols-2" : ""}`}>
        {launches.length > 0 && (
          <ListPanel title="Próximos lanzamientos">
            {launches.map((launch) => (
              <LaunchRow key={launch.id} launch={launch} />
            ))}
          </ListPanel>
        )}
        {events.length > 0 && (
          <ListPanel title="Eventos">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ListPanel>
        )}
      </div>
    </BrandSection>
  );
}

function ListPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={SURFACE}>
      <p className="border-b border-white/[0.06] px-4 py-3 text-xs font-medium text-surface-400">{title}</p>
      <ul className="divide-y divide-white/[0.06]">{children}</ul>
    </div>
  );
}

function RowLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const cls = "group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03]";
  return <li>{href ? <Link href={href} className={cls}>{children}</Link> : <div className={cls}>{children}</div>}</li>;
}

function LaunchRow({ launch }: { launch: BrandLaunch }) {
  const price = formatReferencePrice(launch.referencePrice, launch.currency);
  return (
    <RowLink href={launch.note?.path ?? null}>
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-white">
        {launch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(launch.imageUrl)} alt={launch.name} className="h-full w-full object-contain p-1" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-800">
            <Package className="h-5 w-5 text-surface-500" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-medium text-white">{launch.note?.title ?? launch.name}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-surface-400">
          {launch.note ? launch.name : "Sin presentación todavía"}
        </p>
        <p className="mt-1 text-xs text-surface-500">
          {launch.incomingAt ? (
            <span className="text-sky-300">
              Llega el {new Date(launch.incomingAt).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
            </span>
          ) : (
            "Fecha a confirmar"
          )}
          {price ? ` · Precio ref. ${price}` : ""}
        </p>
      </div>
      {launch.note && <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-surface-500 transition-colors group-hover:text-white" />}
    </RowLink>
  );
}

function EventRow({ event }: { event: BrandUpcomingEvent }) {
  const date = event.startsAt ? dayMonth(event.startsAt) : null;
  return (
    <RowLink href={event.path}>
      <div className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-amber-400/10 ring-1 ring-amber-400/20">
        {date ? (
          <>
            <span className="text-lg font-semibold leading-none text-white tabular-nums">{date.day}</span>
            <span className="mt-1 text-[11px] uppercase text-amber-200">{date.month}</span>
          </>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-medium text-white">{event.title}</p>
        {event.startsAt && (
          <p className="mt-0.5 text-xs text-surface-400 first-letter:uppercase">{formatEventWhen(event.startsAt, event.endsAt)}</p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-surface-500">
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {event.location}
            </span>
          )}
          {event.rsvpEnabled && (
            <span className="inline-flex items-center gap-1 text-amber-200">
              <Users className="h-3 w-3" />
              {event.attending > 0 ? `${event.attending} anotados · ` : ""}Anotate
            </span>
          )}
        </p>
      </div>
      <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-surface-500 transition-colors group-hover:text-white" />
    </RowLink>
  );
}
