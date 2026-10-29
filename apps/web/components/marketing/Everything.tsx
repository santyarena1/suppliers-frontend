import {
  BarChart3, Bell, Building2, CheckCircle2, FileSpreadsheet, GitCompare, MessageSquare, Plug, Receipt, ShieldCheck, Store, Users,
} from "lucide-react";
import { Reveal } from "./Reveal";

/** Todo lo demás que trae NODO, para que ninguna función quede afuera de la página. */
const FEATURES = [
  { icon: MessageSquare, title: "Chat con tus vendedores", body: "Le escribís a tu vendedor de cada distribuidor desde NODO. El historial queda en NODO, no en el teléfono de alguien." },
  { icon: CheckCircle2, title: "Tu equipo arma, vos aprobás", body: "Cada uno con sus permisos: quién compra, quién aprueba y quién solo mira. Los pedidos se aprueban con el precio del día." },
  { icon: Receipt, title: "Cuenta corriente y facturas", body: "Saldos, comprobantes y pedidos de cada portal, sin entrar a ninguno." },
  { icon: BarChart3, title: "Cuánto y a quién le comprás", body: "Tus compras por mes, por distribuidor y por producto, con envíos, pagos e impuestos." },
  { icon: Bell, title: "Novedades de las marcas", body: "Lanzamientos, bajas de precio y capacitaciones de las marcas que vendés, y avisos cuando cambia lo que seguís." },
  { icon: GitCompare, title: "Comparador", body: "Poné productos lado a lado: precio, stock y especificaciones de cada distribuidor." },
  { icon: FileSpreadsheet, title: "Proveedores por lista", body: "¿Te mandan la lista por WhatsApp o mail? La subís en Excel y NODO la lee, con los cambios de precio antes de aplicarla." },
  { icon: Store, title: "Vender en NODO", body: "Publicá tu stock para otros comercios: te piden a confirmar y vos decidís a quién le mostrás tu tienda." },
  { icon: Plug, title: "Tu catálogo en tus sistemas", body: "API para tu tienda online, tu ERP, Google Shopping y Meta, con fotos, precio y stock de todos tus distribuidores." },
  { icon: Building2, title: "Marcas y mayoristas", body: "Si sos marca o distribuidor, tu catálogo frente a los comercios que lo buscan, y quién te compra." },
  { icon: Users, title: "Pedidos offline y por esquema", body: "Con los distribuidores sin integración, NODO arma el pedido y te deja el mensaje listo para mandar." },
  { icon: ShieldCheck, title: "Tus datos, tus cuentas", body: "Usás tus propias cuentas de cada portal: tus condiciones, tus formas de pago y tus percepciones." },
];

export function Everything() {
  return (
    <section id="funciones" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Y todo lo que rodea la compra, en el mismo lugar</h2>
          <p className="nl-lead mt-5 max-w-3xl">Hecho para el que compra y vende tecnología todos los días.</p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="nl-surface h-full p-5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-2)]" aria-hidden>
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
                <p className="nl-body mt-2 text-[0.92rem]">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
