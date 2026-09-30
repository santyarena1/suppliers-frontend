import { Check, FileSpreadsheet, FileText, Globe, MessageCircle, X } from "lucide-react";
import { Reveal } from "./Reveal";

const TODAY = [
  { icon: Globe, label: "Portal del primer distribuidor", note: "usuario y clave" },
  { icon: Globe, label: "Portal del segundo", note: "otro usuario, otra clave" },
  { icon: FileText, label: "lista_precios_septiembre.pdf", note: "¿está actualizada?" },
  { icon: MessageCircle, label: "WhatsApp con el vendedor", note: "“¿te queda stock?”" },
  { icon: FileSpreadsheet, label: "comparativa.xlsx", note: "IVA y percepciones a mano" },
];

const WITH_NODO = [
  "Una búsqueda muestra todos los distribuidores a la vez",
  "Precio final con IVA y percepciones de cada uno",
  "Stock actualizado, sin preguntar por WhatsApp",
  "Envío aproximado de cada producto, según cómo te llega de cada uno",
  "Un solo carrito, aunque compres a cinco distribuidores",
  "Todos los pedidos y facturas en el mismo lugar",
];

/** El problema, contado desde el mostrador: cómo se compra hoy y qué cambia. */
export function BeforeAfter() {
  return (
    <section id="como-funciona" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Hoy, cotizar un producto es abrir cinco pestañas</h2>
          <p className="nl-lead mt-5">
            Cada distribuidor tiene su portal, su usuario y su lista. Para saber quién tiene un producto y a cuánto
            entrás a cada uno, anotás, sumás impuestos a mano y recién ahí pedís. Mientras tanto el cliente espera.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-[var(--r)] border border-[var(--line)] bg-[var(--bg-2)] p-6 sm:p-8">
              <p className="nl-h3 text-[var(--fg-2)]">Sin NODO</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {TODAY.map((t, i) => (
                  <li
                    key={t.label}
                    className="flex items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                    style={{ transform: `translateX(${(i % 2) * 10}px)` }}
                  >
                    <t.icon className="h-4 w-4 flex-shrink-0 text-[var(--fg-3)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]">{t.label}</span>
                    <span className="hidden text-xs text-[var(--fg-3)] sm:inline">{t.note}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 flex items-center gap-2 text-sm text-[var(--fg-3)]">
                <X className="h-4 w-4 text-[var(--bad)]" aria-hidden /> Y todo de nuevo con el próximo producto.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="relative h-full overflow-hidden rounded-[var(--r)] border border-[rgb(139_127_255/0.35)] bg-[var(--surface)] p-6 sm:p-8">
              <div className="nl-glow" style={{ width: 360, height: 260, right: -120, top: -120 }} aria-hidden />
              <p className="nl-h3 relative">Con NODO</p>
              <ul className="relative mt-6 flex flex-col gap-4">
                {WITH_NODO.map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                      <Check className="h-3.5 w-3.5 text-[var(--accent-2)]" aria-hidden />
                    </span>
                    <span className="text-[0.975rem] leading-snug text-[var(--fg)]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
