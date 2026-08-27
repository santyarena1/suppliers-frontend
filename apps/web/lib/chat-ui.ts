let tempSeq = 0;

export function newChatTempId() {
  tempSeq += 1;
  return `tmp-${tempSeq}`;
}

export function isoNow() {
  return new Date().toISOString();
}

export function nowMs() {
  return Date.now();
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function canEditChatText(msg: { kind: string; deletedAt: string | null; createdAt: string }) {
  return msg.kind === "TEXT" && !msg.deletedAt && nowMs() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;
}

/** Organización en una línea; persona + rol (y “asignado”) en la otra. */
export function chatPeerLines(peer: {
  name: string;
  roleLabel: string;
  orgName: string;
  isAccountManager?: boolean;
}) {
  const org = peer.orgName.trim() || peer.name;
  const person = [peer.name, peer.roleLabel].filter(Boolean).join(" · ");
  const assigned = peer.isAccountManager ? " · asignado" : "";
  return { org, person: `${person}${assigned}` };
}

/** Iniciales visibles de un nombre de organización o persona. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const AVATAR_TONES = [
  "bg-brand-700 text-brand-100",
  "bg-emerald-800 text-emerald-100",
  "bg-sky-800 text-sky-100",
  "bg-amber-800 text-amber-100",
  "bg-violet-800 text-violet-100",
  "bg-rose-800 text-rose-100",
] as const;

export function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function listWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
