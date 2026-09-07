import "../system.css";
import "../directions.css";
import { DeskDirection, LiveDirection, type Row } from "@/components/system/Directions";

export const metadata = { title: "NODO — Dos direcciones para el sistema" };

const IMG = {
  cpu: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23ffffff'/><rect x='62' y='62' width='76' height='76' rx='6' fill='%23cbd5e1'/><rect x='78' y='78' width='44' height='44' rx='3' fill='%2394a3b8'/><rect x='68' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='68' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='80' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='80' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='92' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='92' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='104' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='104' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='116' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='116' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='128' y='48' width='4' height='12' rx='0' fill='%23cbd5e1'/><rect x='128' y='140' width='4' height='12' rx='0' fill='%23cbd5e1'/></svg>",
  gpu: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23ffffff'/><rect x='30' y='74' width='140' height='58' rx='5' fill='%23cbd5e1'/><circle cx='72' cy='103' r='19' fill='%2394a3b8'/><circle cx='126' cy='103' r='19' fill='%2394a3b8'/><rect x='30' y='64' width='140' height='10' rx='3' fill='%23e2e8f0'/></svg>",
  ssd: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23ffffff'/><rect x='52' y='86' width='96' height='30' rx='4' fill='%23cbd5e1'/><rect x='60' y='94' width='34' height='14' rx='2' fill='%2394a3b8'/><rect x='132' y='90' width='8' height='22' rx='0' fill='%2394a3b8'/></svg>",
  mon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='%23ffffff'/><rect x='34' y='52' width='132' height='80' rx='5' fill='%23cbd5e1'/><rect x='42' y='60' width='116' height='64' rx='2' fill='%2394a3b8'/><rect x='88' y='132' width='24' height='18' rx='0' fill='%23cbd5e1'/><rect x='66' y='150' width='68' height='7' rx='3' fill='%23cbd5e1'/></svg>",
};

/** Cada producto con TODOS los distribuidores que lo tienen: eso es el sistema. */
const ROWS: Row[] = [
  {
    name: "AMD Ryzen 5 5600 3.5GHz AM4",
    brand: "AMD",
    category: "Procesadores",
    sku: "100-100000927BOX",
    img: IMG.cpu,
    offers: [
      { dist: "Distribuidor B", color: "#34d399", price: 119.37, prev: 127.0, stock: 96, sync: "sync 4 min" },
      { dist: "Distribuidor A", color: "#38bdf8", price: 124.8, prev: 124.8, stock: 12, sync: "sync 9 min", mode: "offline" },
      { dist: "Distribuidor E", color: "#f472b6", price: 128.4, prev: 126.1, stock: 3, sync: "sync 22 min" },
      { dist: "Distribuidor C", color: "#fb923c", price: 131.9, stock: 0, sync: "lista de hoy" },
    ],
  },
  {
    name: "Placa de video RTX 4060 8GB GDDR6",
    brand: "ASUS",
    category: "Placas de video",
    sku: "DUAL-RTX4060-O8G",
    img: IMG.gpu,
    offers: [
      { dist: "Distribuidor A", color: "#38bdf8", price: 297.16, prev: 312.8, stock: 4, sync: "sync 12 min", mode: "esquema" },
      { dist: "Distribuidor D", color: "#a78bfa", price: 305.0, stock: 9, sync: "sync 31 min" },
      { dist: "Distribuidor B", color: "#34d399", price: 312.8, prev: 309.4, stock: 21, sync: "sync 4 min" },
    ],
  },
  {
    name: "SSD NVMe 1TB Gen4 7000MB/s M.2 2280",
    brand: "Kingston",
    category: "Almacenamiento",
    sku: "SSD1TBG4",
    img: IMG.ssd,
    offers: [
      { dist: "Distribuidor C", color: "#fb923c", price: 62.1, prev: 66.4, stock: 40, sync: "lista de hoy" },
      { dist: "Distribuidor E", color: "#f472b6", price: 64.9, stock: 8, sync: "sync 22 min" },
      { dist: "Distribuidor B", color: "#34d399", price: 68.2, stock: 0, sync: "sync 4 min" },
      { dist: "Distribuidor D", color: "#a78bfa", price: 71.0, stock: 15, sync: "sync 31 min" },
      { dist: "Distribuidor A", color: "#38bdf8", price: 74.9, stock: 2, sync: "sync 9 min" },
    ],
  },
  {
    name: 'Monitor 27" 180Hz IPS 1ms FreeSync',
    brand: "Gigabyte",
    category: "Monitores",
    sku: "MON27180",
    img: IMG.mon,
    offers: [
      { dist: "Distribuidor D", color: "#a78bfa", price: 184.0, prev: 191.6, stock: 6, sync: "sync 31 min" },
      { dist: "Distribuidor A", color: "#38bdf8", price: 199.5, stock: null, sync: "sync 9 min" },
      { dist: "Distribuidor C", color: "#fb923c", price: 212.5, stock: 11, sync: "lista de hoy" },
    ],
  },
];

function Head({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3">
        <span className="sys-num text-[1.05rem]" style={{ color: "var(--sys-fg-faint)" }}>
          {kicker}
        </span>
        <h2 className="sys-title text-[1.35rem]">{title}</h2>
      </div>
      <p className="mt-3 max-w-3xl text-[0.82rem] leading-relaxed" style={{ color: "var(--sys-fg-dim)" }}>
        {children}
      </p>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <div className="sys min-h-screen">
      <div className="mx-auto w-full max-w-[1320px] px-6 sm:px-8 py-10 sm:py-14">
        <header className="mb-14">
          <span className="sys-label">Propuesta · no está en producción</span>
          <h1 className="sys-title text-[2rem] sm:text-[2.6rem] mt-3">Dos direcciones</h1>
          <p className="mt-4 max-w-3xl text-[0.86rem] leading-relaxed" style={{ color: "var(--sys-fg-dim)" }}>
            La propuesta anterior tenía poca vida y con razón: hice todo más silencioso y lo llamé
            profesional. Fondo casi negro, un solo acento, todos los bordes iguales, todas las
            etiquetas en la misma mono chiquita. Eso es exactamente el molde donde caen las
            interfaces hechas por IA.
          </p>
          <p className="mt-3 max-w-3xl text-[0.86rem] leading-relaxed" style={{ color: "var(--sys-fg-dim)" }}>
            Estas dos parten de algo que tu sistema ya tiene y yo había ignorado: cada distribuidor
            tiene su color. Eso no es adorno, es el dato que más rápido se lee, y ninguna otra
            herramienta lo puede copiar porque nadie más tiene tus quince proveedores. Acá el color
            manda.
          </p>
        </header>

        <section className="mb-20">
          <Head kicker="1" title="Mesa de operaciones">
            Comprar stock es operar: los precios se mueven, hay quince contrapartes y gana el que ve
            el número primero. La pantalla se comporta como una mesa. Arriba corre la cinta con el
            dólar y las bajas del día. Cada fila lleva el color del distribuidor que tiene el mejor
            precio, y el precio es el número más grande de la pantalla, pintado de ese color. El
            abanico del medio muestra dónde cae cada distribuidor entre el más barato y el más caro.
            Tocá una fila y se abre el libro completo.
          </Head>
          <DeskDirection rows={ROWS} />
        </section>

        <section className="mb-16">
          <Head kicker="2" title="Catálogo vivo">
            Lo opuesto: papel claro y cálido, foto grande, y el color del distribuidor como filo
            superior de cada tarjeta. La energía la ponen los productos y el código de color, no un
            acento neón sobre negro. El resultado más barato ocupa el doble de espacio, y abajo de
            cada precio aparecen las otras fuentes con su color y su número, para comparar sin
            abrir nada.
          </Head>
          <LiveDirection rows={ROWS} />
        </section>

        <footer className="pt-8" style={{ borderTop: "1px solid var(--sys-hair)" }}>
          <p className="text-[0.72rem] leading-relaxed" style={{ color: "var(--sys-fg-faint)" }}>
            Vista de propuesta con datos de ejemplo. No toca el sistema en funcionamiento ni cambia
            ninguna ruta real. Los distribuidores se muestran anónimos.
          </p>
        </footer>
      </div>
    </div>
  );
}
