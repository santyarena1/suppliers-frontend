/**
 * Una sola operación a la vez sobre el carrito de una misma cuenta del portal.
 *
 * Elit guarda el carrito por cuenta, no por sesión: dos cotizaciones a la vez
 * (la precarga del carrito y un cambio de opciones del comercio) se pisaban.
 * Una vaciaba el carrito mientras la otra lo leía, y el aviso de «esto está
 * solo en el portal» se perdía aunque el portal lo siguiera cobrando.
 *
 * Es en memoria: alcanza mientras la API corra en una sola instancia.
 */
const tails = new Map<string, Promise<unknown>>();

export function withPortalCartLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}

/** Clave de la cuenta del portal: proveedor + nro. de cliente o usuario. */
export function portalAccountKey(provider: string, account: string | undefined): string {
  return `${provider}:${(account ?? "").trim().toLowerCase()}`;
}
