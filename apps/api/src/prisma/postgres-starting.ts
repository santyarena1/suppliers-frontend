/** Postgres todavía está rehaciendo el WAL y rechaza conexiones. */
const STARTING =
  /not yet accepting connections|Consistent recovery state|the database system is starting up|the database system is in recovery mode|Can't reach database server|Server has closed the connection|ECONNREFUSED|ECONNRESET|P1001|P1017/i;

export function isPostgresStarting(text: string): boolean {
  return STARTING.test(text);
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 2s, 4s, 6s… con tope de 15s. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(15, Math.max(2, attempt * 2));
}

/**
 * Repite `run` mientras `ready` sea falso. El último resultado se devuelve
 * igual si se agotan los intentos: quien llama decide si eso es un error.
 */
export async function waitUntil<T>(
  run: () => Promise<T>,
  ready: (result: T) => boolean,
  opts: {
    maxAttempts?: number;
    sleep: (ms: number) => Promise<void>;
    onWait: (attempt: number, seconds: number) => void;
    /** Si devuelve falso, se corta: ese fallo no es “todavía está arrancando”. */
    retry?: (result: T) => boolean;
  }
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 40;
  let last!: T;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await run();
    if (ready(last)) return last;
    if (opts.retry && !opts.retry(last)) return last;
    if (attempt === maxAttempts) return last;
    const seconds = retryDelaySeconds(attempt);
    opts.onWait(attempt, seconds);
    await opts.sleep(seconds * 1000);
  }
  return last;
}
