/** Username interno del dueño placeholder de una marca del catálogo. */
export function brandPlaceholderUsername(label: string): string {
  const ascii = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  return `marca.${ascii || "org"}`;
}

export function newPublicKey(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}
