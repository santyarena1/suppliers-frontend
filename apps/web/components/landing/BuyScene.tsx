"use client";

import SystemShot from "./SystemShot";
import { SectionHead, Shell } from "./ui";

const POINTS = [
  {
    t: "Carrito multi-proveedor",
    d: "Armás una sola cotización con ítems de varios distribuidores. NODO la parte solo: un pedido por proveedor.",
  },
  {
    t: "Online u offline",
    d: "Donde hay integración, el pedido entra al portal. Donde no, queda registrado y te deja el mensaje listo para el vendedor.",
  },
  {
    t: "Aprobación del equipo",
    d: "Un vendedor arma el carrito; el dueño o admin firma. Historial completo por comercio y por proveedor.",
  },
];

export default function BuyScene() {
  return (
    <section id="comprar" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={
            <>
              Comprar y
              <br />
              seguir el pedido
            </>
          }
          meta="03 · Compra"
          lead="Dejá de armar pedidos a mano en cada portal. En NODO el carrito se convierte en pedidos reales — o en el texto listo para WhatsApp — con aprobación interna cuando tu equipo lo necesita."
        />

        <div className="grid gap-5 md:grid-cols-3 mb-10">
          {POINTS.map((p) => (
            <div key={p.t} className="lnd-panel p-5 sm:p-6">
              <h3 className="text-[0.95rem] font-medium text-[var(--fg)]">{p.t}</h3>
              <p className="lnd-note mt-3 leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SystemShot
            src="/static/landing/shots/cart.webp"
            alt="Carrito multi-proveedor de NODO"
            caption="Carrito · cotización online u offline por proveedor"
          />
          <SystemShot
            src="/static/landing/shots/orders.webp"
            alt="Historial y aprobación de pedidos en NODO"
            caption="Pedidos · firma pendiente, offline y confirmados"
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <SystemShot
            src="/static/landing/shots/providers.webp"
            alt="Dashboard de proveedores conectados"
            caption="Proveedores · compras, catálogo y sync por comercio"
          />
          <SystemShot
            src="/static/landing/shots/team.webp"
            alt="Gestión de equipo y roles del comercio"
            caption="Equipo · roles y permisos completos en todos los planes"
          />
        </div>
      </Shell>
    </section>
  );
}
