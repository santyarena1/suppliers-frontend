"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { chatApi, type ChatMessage } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import {
  bumpChatUnread,
  getActiveChatThread,
  isChatMuted,
  playChatSound,
  setChatConnected,
  setChatUnread,
} from "@/lib/chat-unread";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

type Handler = (type: string, payload: { threadId?: string; data: unknown }) => void;
const handlers = new Set<Handler>();

export function subscribeChatEvents(handler: Handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

function notifyHandlers(type: string, payload: { threadId?: string; data: unknown }) {
  handlers.forEach((fn) => fn(type, payload));
}

/**
 * Mantiene el SSE del chat mientras hay sesión. El badge y las notificaciones
 * del sistema siguen vivos aunque no estés en Mensajes.
 */
export default function ChatRealtime() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let stopped = false;
    let source: EventSource | null = null;
    let retry = 1000;

    async function hydrate() {
      try {
        const res = await chatApi.unread();
        setChatUnread(res.data.unreadTotal);
      } catch {
        /* la sesión o la red; el interceptor de 401 se encarga */
      }
    }

    function connect() {
      if (stopped) return;
      const url = `${API_BASE}/my/chat/stream?token=${encodeURIComponent(token!)}`;
      source = new EventSource(url);
      source.onopen = () => {
        retry = 1000;
        setChatConnected(true);
      };
      const onEvent = (type: string) => (ev: MessageEvent) => {
        let payload: { threadId?: string; data: unknown } = { data: null };
        try {
          payload = JSON.parse(ev.data) as { threadId?: string; data: unknown };
        } catch {
          return;
        }
        if (type === "unread") {
          const data = payload.data as { unreadTotal?: number } | null;
          if (typeof data?.unreadTotal === "number") setChatUnread(data.unreadTotal);
        }
        if (type === "message") {
          const msg = payload.data as ChatMessage;
          const me = getUser()?.id;
          const viewing = msg.threadId === getActiveChatThread();
          const muted = Boolean(msg.threadId) && isChatMuted(msg.threadId);
          if (msg.author?.id !== me && !viewing) {
            if (!pathnameRef.current.startsWith("/mensajes")) bumpChatUnread();
            if (!muted && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(msg.author?.username ?? "NODO", {
                body: msg.body || (msg.kind === "IMAGE" ? "Foto" : "Nuevo mensaje"),
                tag: msg.threadId,
              });
            }
            if (!muted) playChatSound();
          }
        }
        notifyHandlers(type, payload);
      };
      for (const type of [
        "hello",
        "unread",
        "message",
        "message_edited",
        "message_deleted",
        "message_reacted",
        "read",
        "typing",
        "presence",
        "ping",
      ]) {
        source.addEventListener(type, onEvent(type));
      }
      source.onerror = () => {
        setChatConnected(false);
        source?.close();
        source = null;
        if (stopped) return;
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 15000);
      };
    }

    void hydrate();
    connect();
    const poll = setInterval(() => void hydrate(), 30000);
    return () => {
      stopped = true;
      setChatConnected(false);
      clearInterval(poll);
      source?.close();
    };
  }, []);

  return null;
}
