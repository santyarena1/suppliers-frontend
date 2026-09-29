/**
 * Vínculo con una marca pedido desde su link público por alguien sin sesión.
 * Se guarda antes de mandarlo a entrar o crear la cuenta, y la app se lo ofrece
 * cuando ya tiene un comercio (o una distribuidora).
 */
const KEY = "nodo.pendingBrandLink";
/** Una semana: después ya no es "lo que venía haciendo". */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingBrandLink {
  publicKey: string;
  brandName: string;
  at: number;
}

export function savePendingBrandLink(publicKey: string, brandName: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ publicKey, brandName, at: Date.now() }));
  } catch {
    // Sin almacenamiento (modo privado): el usuario puede volver al link.
  }
}

export function readPendingBrandLink(): PendingBrandLink | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingBrandLink>;
    if (typeof value.publicKey !== "string" || typeof value.brandName !== "string" || typeof value.at !== "number") {
      clearPendingBrandLink();
      return null;
    }
    if (Date.now() - value.at > MAX_AGE_MS) {
      clearPendingBrandLink();
      return null;
    }
    return { publicKey: value.publicKey, brandName: value.brandName, at: value.at };
  } catch {
    return null;
  }
}

export function clearPendingBrandLink() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que limpiar
  }
}
