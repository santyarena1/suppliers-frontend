"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarDays, Check, FileText, MessageSquare, Package, TrendingDown, UserCheck } from "lucide-react";
import { Reveal, useInView, usePrefersReducedMotion } from "./Reveal";
import { usd } from "./SearchDemo";

const FEED = [
  { icon: Check, tone: "text-[var(--good)]", title: "Tu pedido Nº 00741263 fue confirmado", meta: "Pedidos" },
  { icon: TrendingDown, tone: "text-[var(--good)]", title: "Bajó de precio un producto que seguís", meta: "Precios" },
  { icon: Package, tone: "text-[var(--accent-2)]", title: "Lanzamiento: llega la DDR5 de 32 GB el 20 de octubre", meta: "Novedades de marcas" },
  { icon: UserCheck, tone: "text-[var(--warn)]", title: "Martín armó un pedido de US$ 1.240 para aprobar", meta: "Tu equipo" },
  { icon: CalendarDays, tone: "text-[var(--accent-2)]", title: "Capacitación online, martes 13 a las 18 h", meta: "Eventos" },
  { icon: MessageSquare, tone: "text-[var(--fg-2)]", title: "Lucía, tu vendedora, te respondió", meta: "Chat" },
];

function Feed() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const [count, setCount] = useState(FEED.length);

  useEffect(() => {
    if (reduced || !inView) return;
    setCount(1);
    const id = setInterval(() => setCount((c) => (c >= FEED.length ? 1 : c + 1)), 1700);
    return () => clearInterval(id);
  }, [reduced, inView]);

  const visible = FEED.slice(0, count).reverse();
  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      {visible.map((item) => (
        <div key={item.title} className="nl-anim-in flex items-start gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-3">
          <item.icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${item.tone}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm leading-snug text-white">{item.title}</p>
            <p className="mt-0.5 text-xs text-[var(--fg-3)]">{item.meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const MONTHS = [
  { m: "Abr", v: 11.2 },
  { m: "May", v: 13.9 },
  { m: "Jun", v: 12.4 },
  { m: "Jul", v: 16.8 },
  { m: "Ago", v: 15.1 },
  { m: "Sep", v: 18.6 },
];

/** Lo que pasa alrededor de la compra: avisos, chat, aprobaciones, cuenta y análisis. */
export function Communications() {
  const maxMonth = Math.max(...MONTHS.map((x) => x.v));
  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Te enterás de todo sin perseguir a nadie</h2>
          <p className="nl-lead mt-5">
            Confirmaciones de pedidos, bajas de precio, lanzamientos y capacitaciones de las marcas, mensajes de tus
            vendedores y pedidos de tu equipo para aprobar. Todo llega a NODO.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto]">
          <Reveal className="lg:row-span-2">
            <div className="nl-surface relative h-full overflow-hidden p-5 sm:p-6">
              <div className="nl-glow" style={{ width: 320, height: 240, left: -120, top: -100 }} aria-hidden />
              <p className="relative inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Bell className="h-4 w-4 text-[var(--accent-2)]" aria-hidden /> Notificaciones
              </p>
              <div className="relative mt-5">
                <Feed />
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="nl-surface h-full p-5 sm:p-6">
              <p className="text-sm font-semibold text-white">Chat con tus vendedores</p>
              <div className="mt-4 flex flex-col gap-2.5 text-sm">
                <div className="max-w-[88%] rounded-[12px] rounded-tl-sm bg-[var(--surface-2)] px-3.5 py-2.5 text-[var(--fg)]">
                  <p className="text-xs font-semibold text-[var(--accent-2)]">Lucía · tu vendedora</p>
                  <p className="mt-1">Te separé las 10 fuentes de 650 W. Entran el jueves.</p>
                </div>
                <div className="ml-auto max-w-[80%] rounded-[12px] rounded-tr-sm bg-[var(--accent)] px-3.5 py-2.5 text-white">
                  Perfecto, sumalas al pedido de esta semana.
                </div>
              </div>
              <p className="mt-4 text-sm text-[var(--fg-3)]">El historial queda en NODO, no en el teléfono de alguien.</p>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="nl-surface h-full p-5 sm:p-6">
              <p className="text-sm font-semibold text-white">Tu equipo arma, vos aprobás</p>
              <div className="mt-4 rounded-[10px] border border-[var(--line)] bg-[var(--bg-2)] p-4">
                <p className="text-sm text-white">Pedido de Martín</p>
                <p className="mt-1 text-xs text-[var(--fg-3)]">14 productos · armado hoy 10:42</p>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <span className="text-[var(--fg-2)]">Cuando lo armó</span>
                  <span className="tabular-nums text-white">{usd(1240)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span className="text-[var(--fg-2)]">Precio de hoy</span>
                  <span className="tabular-nums text-[var(--good)]">{usd(1226.4)}</span>
                </div>
                <span className="nl-btn nl-btn--primary nl-btn--sm mt-4 w-full" aria-hidden>
                  Aprobar y enviar
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="nl-surface h-full p-5 sm:p-6">
              <p className="text-sm font-semibold text-white">Cuánto y a quién le comprás</p>
              <div className="mt-5 flex h-32 gap-2.5" role="img" aria-label="Compras por mes, de abril a septiembre, en aumento">
                {MONTHS.map((x, i) => (
                  <div key={x.m} className="flex h-full flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-[6px] ${i === MONTHS.length - 1 ? "bg-[var(--accent)]" : "bg-[rgb(139_127_255/0.3)]"}`}
                        style={{ height: `${(x.v / maxMonth) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[var(--fg-3)]">{x.m}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-[var(--fg-3)]">Por mes, por distribuidor y por producto, con tu ticket promedio.</p>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="nl-surface h-full p-5 sm:p-6">
              <p className="text-sm font-semibold text-white">Cuenta corriente y facturas</p>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm">
                {[
                  { p: "Distribuidor 1", s: 2310.4, due: "vence 15/10" },
                  { p: "Distribuidor 2", s: 884.0, due: "al día" },
                  { p: "Distribuidor 3", s: 1462.75, due: "vence 22/10" },
                ].map((a) => (
                  <li key={a.p} className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-white">
                      <FileText className="h-4 w-4 text-[var(--fg-3)]" aria-hidden /> {a.p}
                    </span>
                    <span className="text-right">
                      <span className="block tabular-nums text-white">{usd(a.s)}</span>
                      <span className="text-xs text-[var(--fg-3)]">{a.due}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-[var(--fg-3)]">Saldos y comprobantes de cada portal, sin entrar a ninguno.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
