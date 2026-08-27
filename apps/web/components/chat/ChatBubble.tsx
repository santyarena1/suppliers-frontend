"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Pin, Smile } from "lucide-react";
import {
  CHAT_REACTION_EMOJIS,
  chatApi,
  type ChatMessage,
} from "@/lib/api";
import { assetUrl } from "@/lib/assets";
import { formatUSD } from "@/lib/format";

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    part.startsWith("http") ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2">
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
}) {
  const [menu, setMenu] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(msg.body);
  const [saving, setSaving] = useState(false);

  if (msg.kind === "SYSTEM") {
    return <p className="text-[11px] text-center text-surface-500 py-1 px-6">{msg.body}</p>;
  }

  const payload = (msg.payload ?? {}) as Record<string, unknown>;
  const canEdit =
    mine &&
    canWrite &&
    msg.kind === "TEXT" &&
    !msg.deletedAt &&
    Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000;
  const reactions = msg.reactions ?? [];

  async function toggleReact(emoji: string) {
    try {
      const res = await chatApi.react(msg.id, emoji);
      onUpdated(res.data);
    } catch {
      /* el aviso lo muestra el hilo si hace falta */
    }
    setReactOpen(false);
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

  return (
    <div
      className={`flex gap-2 group ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"}`}
      onMouseLeave={() => {
        setMenu(false);
        setReactOpen(false);
      }}
    >
      {!mine && (
        <div
          className={`w-7 h-7 rounded-full bg-surface-800 text-[10px] font-semibold text-surface-300 flex items-center justify-center flex-shrink-0 ${grouped ? "opacity-0" : ""}`}
        >
          {(msg.author?.username ?? "?").slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className={`max-w-[80%] sm:max-w-[70%] relative ${mine ? "items-end" : "items-start"} flex flex-col`}>
        {!mine && !grouped && msg.author && (
          <p className="text-[10px] font-medium text-brand-300 mb-0.5 px-1">{msg.author.username}</p>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm relative ${
            mine
              ? "bg-brand-600 text-white rounded-br-md"
              : "bg-surface-800 text-surface-100 rounded-bl-md"
          } ${msg.pending ? "opacity-70" : ""} ${msg.failed ? "ring-1 ring-red-400" : ""}`}
        >
          {msg.replyTo && (
            <p
              className={`text-[11px] mb-1 pl-2 border-l ${
                mine ? "border-white/40 text-white/80" : "border-surface-500 text-surface-400"
              }`}
            >
              {msg.replyTo.author}: {msg.replyTo.body || msg.replyTo.kind}
            </p>
          )}
          {msg.deletedAt ? (
            <p className="italic opacity-70">Mensaje eliminado</p>
          ) : editing ? (
            <div className="flex flex-col gap-1.5 min-w-[180px]">
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
            <button type="button" onClick={() => onImage(payload.url as string)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(payload.url as string)} alt="" className="rounded-lg max-h-56" />
            </button>
          ) : msg.kind === "FILE" && typeof payload.url === "string" ? (
            <a href={assetUrl(payload.url as string)} target="_blank" rel="noreferrer" className="underline">
              {msg.body || (payload.filename as string) || "Archivo"}
            </a>
          ) : msg.kind === "ORDER" ? (
            <Link href="/pedidos" className="flex flex-col gap-0.5">
              <p className="font-medium">{msg.body}</p>
              <p className="text-[11px] opacity-80">
                {String(payload.providerName ?? "")}
                {payload.total != null ? ` · ${formatUSD(Number(payload.total))}` : ""}
                {payload.approvalStatus ? ` · ${String(payload.approvalStatus)}` : ""}
              </p>
              <span className="text-[10px] underline underline-offset-2 opacity-80">Ver en Pedidos</span>
            </Link>
          ) : msg.kind === "PRODUCT" ? (
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{msg.body}</p>
              {typeof payload.name === "string" && <p className="text-[11px] opacity-80">{payload.name}</p>}
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{linkify(msg.body)}</p>
          )}
          <div className={`flex items-center gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
            <span className="text-[10px] opacity-70">
              {messageTime(msg.createdAt)}
              {msg.editedAt ? " · editado" : ""}
              {msg.pending ? " · enviando" : ""}
              {msg.failed ? " · no se envió" : ""}
            </span>
            {mine && !msg.pending && (
              seen ? (
                <CheckCheck className="w-3.5 h-3.5 text-sky-200" aria-label="Visto" />
              ) : (
                <Check className="w-3.5 h-3.5 opacity-70" aria-label="Enviado" />
              )
            )}
          </div>
        </div>
        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${mine ? "justify-end" : ""}`}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                title={reaction.users.map((u) => u.username).join(", ")}
                onClick={() => canWrite && void toggleReact(reaction.emoji)}
                className="text-[11px] bg-surface-800 border border-surface-700 rounded-full px-1.5 py-0.5 hover:border-brand-500"
              >
                {reaction.emoji} {reaction.users.length}
              </button>
            ))}
          </div>
        )}
        {canWrite && !msg.deletedAt && !msg.pending && (
          <div
            className={`absolute top-0 ${mine ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"} hidden group-hover:flex items-center gap-0.5 bg-surface-900 border border-surface-700 rounded-md p-0.5 z-10`}
          >
            <button type="button" className="p-1 text-surface-400 hover:text-white" title="Reaccionar" onClick={() => setReactOpen((v) => !v)}>
              <Smile className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 text-surface-400 hover:text-white text-[10px]" onClick={onReply}>
              Responder
            </button>
            <button type="button" className="p-1 text-surface-400 hover:text-white" title="Fijar" onClick={onPin}>
              <Pin className="w-3.5 h-3.5" />
            </button>
            <button type="button" className="p-1 text-surface-400 hover:text-white text-[10px]" onClick={() => setMenu((v) => !v)}>
              Más
            </button>
          </div>
        )}
        {reactOpen && (
          <div className={`absolute z-20 bg-surface-900 border border-surface-700 rounded-full px-1.5 py-1 flex gap-0.5 ${mine ? "right-0" : "left-0"} top-8`}>
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className="text-base hover:scale-110" onClick={() => void toggleReact(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        )}
        {menu && (
          <div className={`absolute z-20 bg-surface-900 border border-surface-700 rounded-md py-1 text-[11px] min-w-[8rem] ${mine ? "right-0" : "left-0"} top-8`}>
            <button
              type="button"
              className="block w-full text-left px-3 py-1 hover:bg-surface-800 text-surface-200"
              onClick={() => {
                void navigator.clipboard.writeText(msg.body);
                setMenu(false);
              }}
            >
              Copiar
            </button>
            {canEdit && (
              <button
                type="button"
                className="block w-full text-left px-3 py-1 hover:bg-surface-800 text-surface-200"
                onClick={() => {
                  setEditing(true);
                  setEditBody(msg.body);
                  setMenu(false);
                }}
              >
                Editar
              </button>
            )}
            <button
              type="button"
              className="block w-full text-left px-3 py-1 hover:bg-surface-800 text-red-300"
              onClick={() => {
                setMenu(false);
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
