/** Geometría de la guía: dónde va la tarjeta para no tapar lo que se señala. */

export type Rect = { top: number; left: number; width: number; height: number };
export type Placement = { top: number; left: number; side: "below" | "above" | "right" | "left" | "center" };

const GAP = 14;
const MARGIN = 16;

/** Agranda el recorte un poco y lo limita a la pantalla (una grilla entera no tiene que tragarse todo). */
export function padRect(r: Rect, vw: number, vh: number, pad = 8): Rect {
  const top = Math.max(MARGIN / 2, r.top - pad);
  const left = Math.max(MARGIN / 2, r.left - pad);
  const width = Math.min(vw - left - MARGIN / 2, r.width + pad * 2);
  const height = Math.min(vh - top - MARGIN / 2, r.height + pad * 2, Math.floor(vh * 0.7));
  return { top, left, width, height };
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top);
}

/**
 * Prueba abajo, arriba, a la derecha y a la izquierda del recorte, con el
 * tamaño real de la tarjeta, y se queda con el primer lugar donde entra entera
 * sin pisar el recorte. Si no hay ninguno, la centra abajo.
 */
export function placeCard(hole: Rect | null, card: { width: number; height: number }, vw: number, vh: number): Placement {
  const clampLeft = (x: number) => Math.min(vw - card.width - MARGIN, Math.max(MARGIN, x));
  const clampTop = (y: number) => Math.min(vh - card.height - MARGIN, Math.max(MARGIN, y));
  const bottomCenter: Placement = { top: vh - card.height - MARGIN * 1.5, left: (vw - card.width) / 2, side: "center" };
  if (!hole) return { top: (vh - card.height) / 2, left: (vw - card.width) / 2, side: "center" };

  const alignedLeft = clampLeft(hole.left + hole.width / 2 - card.width / 2);
  const alignedTop = clampTop(hole.top + hole.height / 2 - card.height / 2);
  const candidates: Placement[] = [
    { top: hole.top + hole.height + GAP, left: alignedLeft, side: "below" },
    { top: hole.top - card.height - GAP, left: alignedLeft, side: "above" },
    { top: alignedTop, left: hole.left + hole.width + GAP, side: "right" },
    { top: alignedTop, left: hole.left - card.width - GAP, side: "left" },
  ];
  for (const candidate of candidates) {
    const box = { top: candidate.top, left: candidate.left, width: card.width, height: card.height };
    const fits =
      box.top >= MARGIN &&
      box.left >= MARGIN &&
      box.top + box.height <= vh - MARGIN &&
      box.left + box.width <= vw - MARGIN;
    if (fits && !overlaps(box, hole)) return candidate;
  }
  return bottomCenter;
}
