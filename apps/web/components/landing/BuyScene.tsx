"use client";

import { FileText, MessageSquare, ShieldCheck } from "lucide-react";
import { Chip, ICON_STROKE, IllustrativeNote, Reveal, SectionHead, Shell } from "./ui";

const CART = [
  {
    source: "Fuente 02",
    mode: "Compra online",
    note: "El pedido se crea en el portal del distribuidor",
    lines: [
      { name: "Fuente 700W 80 Plus Bronze", qty: 4, total: "477,48" },
      { name: "SSD NVMe 1TB Gen4", qty: 10, total: "621,00" },
    ],
    total: "1.098,48",
    online: true,
  },
  {
    source: "Fuente 03",
    mode: "Pedido por mensaje",
    note: "Cotiza por planilla: queda registrado y se copia para el vendedor",
    lines: [{ name: "Monitor 27\" 180Hz IPS", qty: 2, total: "368,00" }],
    total: "368,00",
    online: false,
  },
];

const ORDERS = [
  { id: "1316224", date: "22/12", state: "Facturado", amount: "1.098,48", doc: true },
  { id: "1304588", date: "31/10", state: "En preparación", amount: "742,10", doc: false },
  { id: "1267859", date: "24/04", state: "Facturado", amount: "260,77", doc: true },
];

export default function BuyScene() {
  return (
    <section id="comprar" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>Comprar y<br />seguir el pedido</>}
          meta="03 · Compra"
          lead="El carrito se arma mezclando distribuidores y se parte solo, uno por proveedor. Donde hay integración, el pedido entra de verdad en el portal del distribuidor. Donde no la hay, queda registrado en NODO y te deja el mensaje listo para el vendedor."
        />

        <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-8 items-start">
          <Reveal className="space-y-5">
            {CART.map((g) => (
              <div key={g.source} className={`lnd-panel overflow-hidden${g.online ? " lnd-panel--active" : ""}`}>
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b" style={{ borderColor: "var(--hair)" }}>
                  <span className="lnd-mono text-[0.8rem]">{g.source}</span>
                  <Chip tone={g.online ? "ember" : "neutral"}>{g.mode}</Chip>
                </div>

                {g.lines.map((l) => (
                  <div key={l.name} className="lnd-row grid-cols-[1fr_auto_auto]">
                    <span className="text-[0.85rem] truncate">{l.name}</span>
                    <span className="lnd-mono text-[0.75rem] text-[var(--fg-faint)]">×{l.qty}</span>
                    <span className="lnd-mono text-[0.85rem] whitespace-nowrap">USD {l.total}</span>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t" style={{ borderColor: "var(--hair)" }}>
                  <span className="lnd-note leading-relaxed max-w-[62%]">{g.note}</span>
                  <span className="lnd-mono text-[0.95rem]" style={{ color: g.online ? "var(--ember)" : "var(--fg)" }}>
                    USD {g.total}
                  </span>
                </div>
              </div>
            ))}
          </Reveal>

          <Reveal delay={90} className="space-y-5">
            <div className="lnd-panel overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b" style={{ borderColor: "var(--hair)" }}>
                <span className="lnd-label">Historial y comprobantes</span>
              </div>
              {ORDERS.map((o) => (
                <div key={o.id} className="lnd-row grid-cols-[auto_1fr_auto]">
                  <span className="lnd-mono text-[0.78rem] text-[var(--fg-faint)]">{o.date}</span>
                  <div className="min-w-0">
                    <div className="lnd-mono text-[0.8rem] truncate">#{o.id}</div>
                    <div className="lnd-label mt-1">{o.state}</div>
                  </div>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <span className="lnd-mono text-[0.82rem]">USD {o.amount}</span>
                    {o.doc && (
                      <FileText className="w-3.5 h-3.5" strokeWidth={ICON_STROKE} style={{ color: "var(--lilac)" }} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <ul className="space-y-3">
              {[
                { icon: ShieldCheck, t: "Un empleado arma el pedido, el dueño lo confirma", d: "La aprobación es del comercio, no del distribuidor." },
                { icon: FileText, t: "Cuenta corriente y facturas donde el portal las da", d: "Saldo, vencimientos y el PDF, sin entrar al portal." },
                { icon: MessageSquare, t: "Chat con el vendedor asignado", d: "La conversación queda junto al pedido, no en un teléfono." },
              ].map((f) => (
                <li key={f.t} className="flex items-start gap-3">
                  <f.icon className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={ICON_STROKE} style={{ color: "var(--lilac)" }} />
                  <div>
                    <div className="text-[0.88rem]">{f.t}</div>
                    <div className="lnd-body text-[0.8rem] mt-0.5">{f.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <IllustrativeNote>
          Pedidos de ejemplo. Qué se puede hacer en cada distribuidor depende de lo que su portal
          permita: algunos aceptan el pedido completo, otros solo lectura de cuenta.
        </IllustrativeNote>
      </Shell>
    </section>
  );
}
