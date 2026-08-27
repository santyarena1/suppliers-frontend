"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Pin, Smile } from "lucide-react";
import {
  CHAT_REACTION_EMOJIS,
  chatApi,
  type ChatMessage,
} from "@/lib/api";
import { assetUrl } from "@/lib/assets";
import { formatUSD } from "@/lib/format";
import { avatarTone, initials } from "@/lib/chat-ui";

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    part.startsWith("http") ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function messageTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - that.getTime()) / 86400000;
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" });
}

export default function ChatBubble({
  msg,
  mine,
  grouped,
  canWrite,
  seen,
  onReply,
  onPin,
  onDelete,
  onImage,
  onUpdated,
  onRetry,
}: {
  msg: ChatMessage;
  mine: boolean;
  grouped: boolean;
  canWrite: boolean;
  seen: boolean;
  onReply: () => void;
  onPin: () => void;
  onDelete: () => void;
  onImage: (url: string) => void;
  onUpdated: (msg: ChatMessage) => void;
  onRetry?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [actions, setActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(msg.body);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!actions && !menu && !reactOpen) return;
    const close = () => {
      setActions(false);
      setMenu(false);
      setReactOpen(false);
    };
    const t = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [actions, menu, reactOpen]);

  if (msg.kind === "SYSTEM") {
    return (
      <p className="self-center text-[11px] text-center text-surface-400 bg-surface-900/80 border border-surface-800 rounded-full px-3 py-1 my-2 max-w-[90%]">
        {msg.body}
      </p>
    );
  }

  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const canEdit =
    mine &&
    canWrite &&
    msg.kind === "TEXT" &&
    !msg.deletedAt &&
    Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000;
  const reactions = msg.reactions ?? [];
  const authorName = msg.author?.username ?? "?";

  async function toggleReact(emoji: string) {
    try {
      const res = await chatApi.react(msg.id, emoji);
      onUpdated(res.data);
    } catch {
      /* el hilo muestra el aviso si hace falta */
    }
    setReactOpen(false);
    setActions(false);
  }

  async function saveEdit() {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      const res = await chatApi.edit(msg.id, editBody.trim());
      onUpdated(res.data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const showBar = canWrite && !msg.deletedAt && !msg.pending && (actions || reactOpen || menu);

  return (
    <div className={`flex gap-2 ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2.5"}`}>
      {!mine && (
        <div
          className={`w-8 h-8 rounded-full text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5 ${grouped ? "opacity-0" : avatarTone(authorName)}`}
        >
          {initials(authorName)}
        </div>
      )}
      <div className={`max-w-[85%] sm:max-w-[72%] relative flex flex-col ${mine ? "items-end" : "items-start"}`}>
        {!mine && !grouped && (
          <p className="text-[11px] font-medium text-surface-400 mb-0.5 px-1">{authorName}</p>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (msg.failed && onRetry) {
              onRetry();
              return;
            }
            setActions((v) => !v);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setActions(true);
          }}
          className={`text-left rounded-2xl px-3 py-2 text-sm relative transition-opacity ${
            mine
              ? "bg-brand-600 text-white rounded-br-md"
              : "bg-surface-800 text-surface-100 rounded-bl-md"
          } ${msg.pending ? "opacity-60" : ""} ${msg.failed ? "ring-1 ring-red-400" : ""}`}
        >
          {msg.replyTo && (
            <p
              className={`text-[11px] mb-1.5 pl-2 border-l-2 rounded-sm ${
                mine ? "border-white/50 text-white/80" : "border-brand-400/60 text-surface-400"
              }`}
            >
              <span className="font-medium">{msg.replyTo.author}</span>
              {" · "}
              {(msg.replyTo.body || msg.replyTo.kind).slice(0, 80)}
            </p>
          )}
          {msg.deletedAt ? (
            <p className="italic opacity-70">Mensaje eliminado</p>
          ) : editing ? (
            <div className="flex flex-col gap-1.5 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={2}
                className="w-full bg-black/20 rounded-md px-2 py-1 text-sm text-white resize-none focus:outline-none"
              />
              <div className="flex gap-2 text-[11px]">
                <button type="button" onClick={() => setEditing(false)} className="opacity-80">
                  Cancelar
                </button>
                <button type="button" onClick={() => void saveEdit()} disabled={saving} className="font-semibold">
                  Guardar
                </button>
              </div>
            </div>
          ) : msg.kind === "IMAGE" && typeof payload.url === "string" ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onImage(payload.url as string);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(payload.url as string)} alt="" className="rounded-xl max-h-56 -mx-0.5" />
            </span>
          ) : msg.kind === "FILE" && typeof payload.url === "string" ? (
            <a
              href={assetUrl(payload.url as string)}
              target="_blank"
              rel="noreferrer"
              className="underline"
              onClick={(e) => e.stopPropagation()}
            >
              {msg.body || (payload.filename as string) || "Archivo"}
            </a>
          ) : msg.kind === "ORDER" ? (
            <Link href="/pedidos" onClick={(e) => e.stopPropagation()} className="flex flex-col gap-0.5 min-w-[160px]">
              <p className="font-medium">{msg.body}</p>
              <p className="text-[11px] opacity-80">
                {String(payload.providerName ?? "")}
                {payload.total != null ? ` · ${formatUSD(Number(payload.total))}` : ""}
              </p>
              <span className="text-[10px] opacity-80 mt-0.5">Abrir en Pedidos →</span>
            </Link>
          ) : msg.kind === "PRODUCT" ? (
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{msg.body}</p>
              {typeof payload.name === "string" && <p className="text-[11px] opacity-80">{payload.name}</p>}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words leading-relaxed">{linkify(msg.body)}</p>
          )}
          <div className={`flex items-center gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
            <span className="text-[10px] opacity-70 tabular-nums">
              {messageTime(msg.createdAt)}
              {msg.editedAt ? " · editado" : ""}
              {msg.pending ? " · enviando" : ""}
              {msg.failed ? " · tocá para reenviar" : ""}
            </span>
            {mine && !msg.pending && !msg.failed && (
              seen ? (
                <CheckCheck className="w-3.5 h-3.5 text-sky-200" aria-label="Visto" />
              ) : (
                <Check className="w-3.5 h-3.5 opacity-70" aria-label="Enviado" />
              )
            )}
          </div>
        </button>
        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 -mt-1.5 px-1 ${mine ? "justify-end" : ""}`}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                title={reaction.users.map((u) => u.username).join(", ")}
                onClick={() => canWrite && void toggleReact(reaction.emoji)}
                className="text-[11px] bg-surface-900 border border-surface-700 rounded-full px-1.5 py-0.5 hover:border-brand-500 shadow-sm"
              >
                {reaction.emoji} {reaction.users.length}
              </button>
            ))}
          </div>
        )}
        {showBar && (
          <div
            className={`mt-1 flex items-center gap-0.5 bg-surface-900 border border-surface-700 rounded-full px-1 py-0.5 shadow-lg z-10 ${mine ? "self-end" : "self-start"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="p-1.5 text-surface-400 hover:text-white" title="Reaccionar" onClick={() => setReactOpen((v) => !v)}>
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="px-1.5 py-1 text-[11px] text-surface-300 hover:text-white" onClick={onReply}>
              Responder
            </button>
            <button type="button" className="p-1.5 text-surface-400 hover:text-white" title="Fijar" onClick={onPin}>
              <Pin className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="px-1.5 py-1 text-[11px] text-surface-300 hover:text-white" onClick={() => setMenu((v) => !v)}>
              Más
            </button>
          </div>
        )}
        {reactOpen && (
          <div className={`mt-1 bg-surface-900 border border-surface-700 rounded-full px-1.5 py-1 flex gap-0.5 shadow-lg ${mine ? "self-end" : "self-start"}`}>
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className="text-lg leading-none p-1 hover:scale-110 transition-transform" onClick={() => void toggleReact(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}
        {menu && (
          <div className={`mt-1 bg-surface-900 border border-surface-700 rounded-xl py-1 text-[12px] min-w-[9rem] shadow-lg ${mine ? "self-end" : "self-start"}`}>
            <button
              type="button"
              className="block w-full text-left px-3 py-1.5 hover:bg-surface-800 text-surface-200"
              onClick={() => {
                void navigator.clipboard.writeText(msg.body);
                setMenu(false);
                setActions(false);
              }}
            >
              Copiar
            </button>
            {canEdit && (
              <button
                type="button"
                className="block w-full text-left px-3 py-1.5 hover:bg-surface-800 text-surface-200"
                onClick={() => {
                  setEditing(true);
                  setEditBody(msg.body);
                  setMenu(false);
                  setActions(false);
                }}
              >
                Editar
              </button>
            )}
            <button
              type="button"
              className="block w-full text-left px-3 py-1.5 hover:bg-surface-800 text-red-300"
              onClick={() => {
                setMenu(false);
                setActions(false);
                onDelete();
              }}
            >
              Borrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
