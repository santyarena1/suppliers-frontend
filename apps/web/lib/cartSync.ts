/**
 * Cómo se juntan dos versiones del carrito compartido.
 *
 * El carrito se guarda entero. Si dos pestañas, dos PCs o dos personas lo
 * cambian a la vez, guardar sin más pisa lo del otro: desaparecen productos,
 * vuelven los que ya se pidieron. Por eso cada guardado dice sobre qué versión
 * se hizo (`updatedAt`); si en el servidor hay otra, se juntan las dos así:
 * lo que solo cambió de un lado se toma de ese lado y, si cambió en los dos,
 * se suman las unidades que agregó cada uno.
 */

/** Lo mínimo de una línea para juntar versiones (ver `CartItem` en lib/cart.tsx). */
export type SyncLine = {
  provider: string;
  externalId: string;
  channel?: string;
  schemeId?: string | null;
  qty: number;
  by?: Record<string, number>;
};

export type SyncScheme = { id: string; name: string; provider: string };

export type CartVersion<I extends SyncLine, S extends SyncScheme> = {
  items: I[];
  schemes: S[];
  updatedAt: string | null;
};

export function syncLineKey(line: SyncLine): string {
  const channel = line.channel === "offline" ? "offline" : "online";
  return `${channel}::${line.provider}::${line.schemeId ?? ""}::${line.externalId}`;
}

/** JSON con las claves ordenadas: Postgres (jsonb) no conserva el orden de las claves. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Firma de una línea. El reparto por persona (`by`) lo corrige el servidor y no cuenta. */
export function lineSignature(line: SyncLine | undefined): string {
  if (!line) return "";
  const { by: _by, ...rest } = line;
  return stable(rest);
}

export function sameCart(
  a: { items: SyncLine[]; schemes: SyncScheme[] },
  b: { items: SyncLine[]; schemes: SyncScheme[] }
): boolean {
  if (a.items.length !== b.items.length || a.schemes.length !== b.schemes.length) return false;
  const left = new Map(a.items.map((it) => [syncLineKey(it), lineSignature(it)]));
  for (const it of b.items) if (left.get(syncLineKey(it)) !== lineSignature(it)) return false;
  return stable(a.schemes) === stable(b.schemes);
}

function byKey<T extends SyncLine>(list: T[]): Map<string, T> {
  return new Map(list.map((it) => [syncLineKey(it), it]));
}

/**
 * Junta lo local (cambiado sobre `base`) con lo que hay en el servidor (`remote`).
 * `withQty` cambia la cantidad de una línea manteniendo el reparto por persona.
 * Sin `base` (no se sabe sobre qué versión se trabajó) se toma el servidor y se
 * agrega lo local que no está, sin sumar cantidades dos veces.
 */
export function mergeCartItems<I extends SyncLine>(
  base: I[] | null,
  local: I[],
  remote: I[],
  withQty: (line: I, qty: number) => I
): I[] {
  const R = byKey(remote);
  const L = byKey(local);
  if (!base) {
    return [...remote, ...local.filter((it) => !R.has(syncLineKey(it)))];
  }
  const B = byKey(base);
  const out: I[] = [];
  const decide = (key: string): I | undefined => {
    const b = B.get(key);
    const l = L.get(key);
    const r = R.get(key);
    const ls = lineSignature(l);
    const rs = lineSignature(r);
    const bs = lineSignature(b);
    if (ls === bs) return r;
    if (rs === bs || ls === rs) return l;
    // Cambió en los dos lados.
    if (!l) return undefined; // lo sacaron acá
    const localAdded = l.qty - (b?.qty ?? 0);
    if (!r) {
      // Lo sacaron (o se pidió) en otro lado: queda solo lo que se sumó acá después.
      return localAdded > 0 ? withQty({ ...l, qty: l.qty }, localAdded) : undefined;
    }
    return withQty(r, Math.max(1, r.qty + localAdded));
  };
  const seen = new Set<string>();
  for (const key of [...R.keys(), ...L.keys()]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const line = decide(key);
    if (line) out.push(line);
  }
  return out;
}

export function mergeSchemes<S extends SyncScheme>(base: S[] | null, local: S[], remote: S[]): S[] {
  const R = new Map(remote.map((s) => [s.id, s]));
  const L = new Map(local.map((s) => [s.id, s]));
  if (!base) return [...remote, ...local.filter((s) => !R.has(s.id))];
  const B = new Map(base.map((s) => [s.id, s]));
  const out: S[] = [];
  const seen = new Set<string>();
  for (const id of [...R.keys(), ...L.keys()]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = B.get(id);
    const l = L.get(id);
    const r = R.get(id);
    const pick = stable(l ?? null) === stable(b ?? null) ? r : l;
    if (pick) out.push(pick);
  }
  return out;
}

/** Fecha del carrito del servidor, para no volver a una versión más vieja. */
export function isOlder(candidate: string | null, than: string | null): boolean {
  if (!candidate || !than) return false;
  return Date.parse(candidate) < Date.parse(than);
}
