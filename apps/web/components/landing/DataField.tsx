"use client";

import { useEffect, useRef } from "react";

/** Ritmo del momento autoral, compartido con las filas del DOM que aterrizan encima. */
export const FIELD_BEAT_MS = 520;
export const FIELD_CONVERGE_MS = 1700;

type Layer = "mesh" | "ribbon";

type Particle = {
  /** Posición dispersa: la oferta suelta, antes de que NODO la ordene. */
  hx: number;
  hy: number;
  /** Posición en la fila: la misma oferta ya comparable. */
  tx: number;
  ty: number;
  x: number;
  y: number;
  size: number;
  alpha: number;
  /** Profundidad 0..1: manda tamaño, brillo y cuánto la arrastra el puntero. */
  z: number;
  /** true si converge a una fila del panel; false si queda como catálogo de fondo. */
  matches: boolean;
  /** 0 = neutro (mist/lilac), 1 = el mejor precio (ember). */
  heat: number;
  /** Núcleo de la cinta: es lo único que florece. */
  bloom: boolean;
  layer: Layer;
  phase: number;
  drift: number;
};

type RGB = [number, number, number];

const MIST: RGB = [191, 210, 255];
const LILAC: RGB = [106, 108, 246];
const EMBER: RGB = [255, 106, 61];

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * El campo de datos del hero, en dos planos:
 *
 * - **Malla desplazada** (fondo): una grilla regular deformada por una onda. Es
 *   el catálogo entero, ordenado pero lejano.
 * - **Cintas de interferencia** (frente): cursos de datos con núcleo brillante y
 *   bordes deshilachados. Una parte de esas partículas son las coincidencias de
 *   la búsqueda y viajan a las filas reales del panel, medidas del DOM.
 *
 * Reglas que se respetan acá: una sola animación autoral en la página, el puntero
 * arrastra según profundidad, el dato ya asentado deja de moverse, y con
 * `prefers-reduced-motion` se dibuja el estado final una vez y se corta.
 */
export default function DataField({
  className = "",
  rowSelector = "[data-field-row]",
}: {
  className?: string;
  /** Filas del DOM a las que el campo tiene que aterrizar, medidas en vivo. */
  rowSelector?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let start = 0;
    let running = true;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    function build() {
      const hostRect = host!.getBoundingClientRect();
      w = Math.max(1, hostRect.width);
      h = Math.max(1, hostRect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const narrow = w < 720;
      const ribbonCount = narrow ? 1500 : w < 1100 ? 2400 : 3400;
      /** Solo una parte del frente es "tus coincidencias": el resto es el catálogo que sigue ahí. */
      const MATCH_RATIO = 0.34;

      // Las filas se leen del panel real: si el layout cambia, el campo lo sigue.
      const measured = Array.from(document.querySelectorAll(rowSelector)).map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const left = r.left - hostRect.left;
        return {
          // La fila vive dentro del panel: nada sobresale del recuadro.
          x0: left + 6,
          x1: r.right - hostRect.left - 6,
          y: r.top - hostRect.top + r.height / 2,
        };
      });
      const rows =
        measured.length > 0
          ? measured
          : [0.42, 0.54, 0.66].map((fy) => ({
              x0: w * 0.52,
              x1: w * 0.95,
              y: h * fy,
            }));
      /** La fila del medio es la del mejor precio: se tiñe ember. */
      const hotRow = Math.min(1, rows.length - 1);

      // --- Frente: cintas de interferencia ---
      const RIBBONS = [
        { y: 0.24, amp: 0.17, freq: 2.1, phase: 0.0, spread: 0.075 },
        { y: 0.43, amp: 0.13, freq: 1.6, phase: 1.9, spread: 0.062 },
        { y: 0.61, amp: 0.19, freq: 2.6, phase: 3.4, spread: 0.085 },
        { y: 0.79, amp: 0.11, freq: 1.3, phase: 5.1, spread: 0.055 },
      ];

      const ribbons: Particle[] = Array.from({ length: ribbonCount }, (_, i) => {
        const rb = RIBBONS[i % RIBBONS.length];
        const t = Math.random();
        // Desplazamiento perpendicular al cubo: núcleo brillante, borde disperso.
        const u = Math.random() * 2 - 1;
        const off = u * u * u * rb.spread * h;
        const core = 1 - Math.min(1, Math.abs(u));
        const z = 0.45 + core * 0.55;

        const hx = -w * 0.05 + t * w * 1.1;
        const hy = h * rb.y + Math.sin(t * rb.freq * Math.PI + rb.phase) * rb.amp * h + off;

        const matches = i % 100 < MATCH_RATIO * 100;
        const rowIndex = i % rows.length;
        const row = rows[rowIndex];
        // Sesgada al arranque de la entrada: densa donde se ve, fina dentro del panel.
        const along = Math.random();
        return {
          hx,
          hy,
          tx: matches ? row.x0 + (row.x1 - row.x0) * along : hx,
          ty: matches ? row.y + (Math.random() - 0.5) * 6 : hy,
          x: hx,
          y: hy,
          size: core > 0.7 ? 2.3 : 1.4,
          alpha: (0.1 + core * 0.5) * (matches ? 1.35 : 1),
          z,
          matches,
          heat: matches && rowIndex === hotRow ? 1 : 0,
          bloom: core > 0.66,
          layer: "ribbon" as Layer,
          phase: Math.random() * Math.PI * 2,
          drift: 0.35 + Math.random() * 0.9,
        };
      });

      // --- Fondo: malla desplazada. Grilla regular deformada por una onda. ---
      const step = narrow ? 26 : 20;
      const mesh: Particle[] = [];
      for (let gx = 0; gx <= w + step; gx += step) {
        for (let gy = -step; gy <= h + step; gy += step) {
          const nx = gx / w;
          const ny = gy / h;
          const wave = Math.sin(nx * 5.2 + ny * 2.1) * 13 + Math.cos(nx * 2.7 - ny * 4.4) * 9;
          const fall = Math.max(0, 1 - Math.abs(ny - 0.5) * 1.35);
          const x = gx + wave;
          const y = gy + wave * 0.55;
          mesh.push({
            hx: x,
            hy: y,
            tx: x,
            ty: y,
            x,
            y,
            size: 1,
            alpha: 0.05 + fall * 0.1,
            z: 0.12 + fall * 0.14,
            matches: false,
            heat: 0,
            bloom: false,
            layer: "mesh" as Layer,
            phase: (nx + ny) * Math.PI * 2,
            drift: 0.2 + fall * 0.25,
          });
        }
      }

      particles = [...mesh, ...ribbons];
    }

    function paint(progress: number, time: number) {
      ctx!.clearRect(0, 0, w, h);
      // Aditivo: al condensarse, la fila se enciende sola por acumulación.
      ctx!.globalCompositeOperation = "lighter";
      const settled = easeOutExpo(progress);
      const warp = 30 - settled * 13;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      for (const p of particles) {
        const breathe = Math.sin(time * 0.0006 * p.drift + p.phase);
        // El paralaje sigue la profundidad: lo cercano se arrastra, el fondo casi no.
        const hx = p.hx + pointer.x * warp * p.z * p.drift + breathe * 5 * p.drift * p.z;
        const hy = p.hy + pointer.y * warp * p.z * p.drift * 0.6 + breathe * 3 * p.z;
        const tx = p.tx + breathe * 0.6;

        // El catálogo de fondo nunca "aterriza": sigue respirando y respondiendo
        // al puntero. Solo las coincidencias viajan a su fila.
        p.x = p.matches ? hx + (tx - hx) * settled : hx;
        p.y = p.matches ? hy + (p.ty - hy) * settled : hy;

        const [r, g, b] = mix(mix(MIST, LILAC, 0.45), EMBER, p.heat * settled);
        // Campana: apagado al salir, máximo en pleno viaje, y un lecho tenue al llegar.
        const transit = Math.sin(Math.PI * Math.min(1, settled));
        const focus = p.matches ? 0.3 + transit * 1.45 + settled * 0.24 : 0.9 - settled * 0.34;
        const a = Math.min(1, p.alpha * focus * (0.55 + p.z * 0.65));
        const size = p.size * (0.7 + p.z * 0.55);

        ctx!.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx!.fillRect(p.x, p.y, size, size);

        // Bloom por acumulación: un halo ancho y tenue solo en los núcleos.
        if (p.bloom) {
          const ba = a * (p.matches ? 0.16 : 0.14);
          const bs = size * (p.matches ? 3.4 : 4);
          ctx!.fillStyle = `rgba(${r},${g},${b},${ba})`;
          ctx!.fillRect(p.x - bs / 2, p.y - bs / 2, bs, bs);
        }
      }
    }

    function frame(now: number) {
      if (!running) return;
      if (!start) start = now;
      const elapsed = now - start - FIELD_BEAT_MS;
      const progress = Math.max(0, Math.min(1, elapsed / FIELD_CONVERGE_MS));
      paint(progress, now);
      raf = requestAnimationFrame(frame);
    }

    function onPointer(e: PointerEvent) {
      const rect = host!.getBoundingClientRect();
      pointer.tx = (e.clientX - rect.left) / rect.width - 0.5;
      pointer.ty = (e.clientY - rect.top) / rect.height - 0.5;
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    }

    build();

    if (reduced) {
      // Sin movimiento: se dibuja el estado ordenado, que es el que comunica.
      paint(1, 0);
    } else {
      raf = requestAnimationFrame(frame);
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    }

    const ro = new ResizeObserver(() => {
      const wasStarted = start;
      build();
      if (reduced) paint(1, 0);
      else if (!wasStarted) start = 0;
    });
    ro.observe(host);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rowSelector]);

  return (
    <div ref={hostRef} className={`lnd-field ${className}`} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
