"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  chatApi,
  type ChatMessage,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from "@/lib/api";
import { getUser } from "@/lib/auth";
import { assetUrl } from "@/lib/assets";
import { avatarTone, initials, isoNow, listWhen, newChatTempId, nowMs } from "@/lib/chat-ui";
import {
  chatSoundEnabled,
  draftKey,
  isChatMuted,
  setActiveChatThread,
  setChatMuted,
  setChatSoundEnabled,
  setChatUnread,
  useChatConnection,
} from "@/lib/chat-unread";
import { subscribeChatEvents } from "./ChatRealtime";
import ChatBubble, { dayLabel } from "./ChatBubble";
import {
  ArrowLeft, Bell, BellOff, ChevronDown, Loader2, MessageSquare, Paperclip, Phone, Pin, Search, Send, Volume2, VolumeX, X,
} from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function sameAuthorClose(a: ChatMessage, b: ChatMessage) {
  if (!a.author?.id || a.author.id !== b.author?.id) return false;
  if (a.kind === "SYSTEM" || b.kind === "SYSTEM") return false;
  return Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < 2 * 60 * 1000;
}

export default function ChatApp({
  initialThreadId,
  initialLinkId,
}: {
  initialThreadId?: string;
  initialLinkId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const me = getUser()?.id ?? "";
  const connected = useChatConnection();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [canWrite, setCanWrite] = useState(true);
  const [active, setActive] = useState<ChatThreadDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [searchHits, setSearchHits] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<{ userId: string; username: string }[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [pendingNew, setPendingNew] = useState(0);
  const [notifyAsk, setNotifyAsk] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingAt = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const atBottom = useRef(true);
  const activeId = useRef<string | null>(null);

  useEffect(() => {
    activeId.current = active?.threadId ?? null;
  }, [active?.threadId]);

  useEffect(() => {
    setSoundOn(chatSoundEnabled());
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setNotifyAsk(true);
    }
  }, []);

  useEffect(() => {
    const threadId = active?.threadId ?? null;
    setActiveChatThread(threadId);
    setMuted(threadId ? isChatMuted(threadId) : false);
    return () => setActiveChatThread(null);
  }, [active?.threadId]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const loadList = useCallback(async () => {
    const res = await chatApi.threads();
    setThreads(res.data.threads);
    setCanWrite(res.data.canWrite);
    setChatUnread(res.data.unreadTotal);
    setLoadingList(false);
    return res.data.threads;
  }, []);

  const goToThread = useCallback((threadId: string) => {
    if (pathname !== `/mensajes/${threadId}`) router.replace(`/mensajes/${threadId}`);
  }, [pathname, router]);

  const openLink = useCallback(async (linkId: string) => {
    if (active && active.linkId === linkId && active.threadId) {
      goToThread(active.threadId);
      return;
    }
    setLoadingThread(true);
    try {
      const opened = await chatApi.open(linkId);
      setActive(opened.data);
      const page = await chatApi.messages(opened.data.threadId);
      setMessages(page.data.messages);
      setHasMore(page.data.hasMore);
      setReply(null);
      setHeaderOpen(false);
      setDraft(localStorage.getItem(draftKey(opened.data.threadId)) ?? "");
      await chatApi.read(opened.data.threadId);
      goToThread(opened.data.threadId);
      await loadList();
      requestAnimationFrame(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
        atBottom.current = true;
        setShowJump(false);
        setPendingNew(0);
      });
    } catch (err) {
      setAviso(errMsg(err, "No se pudo abrir la conversación"));
    } finally {
      setLoadingThread(false);
    }
  }, [active, goToThread, loadList]);

  const openThread = useCallback(async (threadId: string) => {
    if (activeId.current === threadId && messages.length > 0) {
      goToThread(threadId);
      return;
    }
    setLoadingThread(true);
    try {
      const [detail, page] = await Promise.all([chatApi.thread(threadId), chatApi.messages(threadId)]);
      setActive(detail.data);
      setMessages(page.data.messages);
      setHasMore(page.data.hasMore);
      setReply(null);
      setHeaderOpen(false);
      setDraft(localStorage.getItem(draftKey(threadId)) ?? "");
      await chatApi.read(threadId);
      goToThread(threadId);
      await loadList();
      requestAnimationFrame(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
        atBottom.current = true;
        setShowJump(false);
        setPendingNew(0);
      });
    } catch (err) {
      setAviso(errMsg(err, "No se pudo abrir la conversación"));
    } finally {
      setLoadingThread(false);
    }
  }, [goToThread, loadList, messages.length]);

  useEffect(() => {
    loadList().catch((err) => {
      setAviso(errMsg(err, "No se pudieron cargar las conversaciones"));
      setLoadingList(false);
    });
  }, [loadList]);

  useEffect(() => {
    if (initialThreadId) void openThread(initialThreadId);
    else if (initialLinkId) void openLink(initialLinkId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLinkId, initialThreadId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setReply(null);
        setHeaderOpen(false);
        setSearchHits(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return subscribeChatEvents((type, payload) => {
      if (type === "message") {
        const msg = payload.data as ChatMessage;
        if (msg.threadId === activeId.current) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            const withoutTemp = prev.filter((m) => !(m.pending && m.body === msg.body && m.author?.id === msg.author?.id));
            return [...withoutTemp, msg];
          });
          void chatApi.read(msg.threadId);
          if (atBottom.current) {
            requestAnimationFrame(() => {
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
            });
          } else {
            setPendingNew((n) => n + 1);
            setShowJump(true);
          }
        }
        void loadList();
      }
      if (type === "message_edited" || type === "message_deleted" || type === "message_reacted") {
        const msg = payload.data as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
      if (type === "read" && payload.threadId === activeId.current) {
        const data = payload.data as { userId: string; lastReadAt: string };
        if (data.userId !== me) {
          setActive((prev) =>
            prev
              ? { ...prev, peerLastReadAt: data.lastReadAt }
              : prev
          );
        }
      }
      if (type === "typing" && payload.threadId === activeId.current) {
        setTyping((payload.data as { userId: string; username: string }[]).filter((row) => row.userId !== me));
      }
      if (type === "presence") {
        void loadList();
      }
    });
  }, [loadList, me]);

  const visibleThreads = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter(
      (t) => t.peer.name.toLowerCase().includes(needle) || (t.lastMessage?.text ?? "").toLowerCase().includes(needle)
    );
  }, [filter, threads]);

  const firstUnreadId = useMemo(() => {
    if (!active || !active.lastReadAt) return messages.find((m) => m.author?.id !== me)?.id;
    const at = new Date(active.lastReadAt).getTime();
    return messages.find((m) => m.author?.id !== me && new Date(m.createdAt).getTime() > at)?.id;
  }, [active, me, messages]);

  const peerSeenAt = active?.peerLastReadAt ? new Date(active.peerLastReadAt).getTime() : 0;

  async function sendText(body = draft.trim(), replyToId = reply?.id, replaceId?: string) {
    if (!active || !body || sending || !canWrite) return;
    const tempId = replaceId ?? newChatTempId();
    if (!replaceId) {
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          threadId: active.threadId,
          kind: "TEXT",
          body,
          payload: null,
          author: { id: me, username: getUser()?.username ?? "Vos" },
          replyTo: reply
            ? { id: reply.id, body: reply.body, kind: reply.kind, author: reply.author?.username ?? null }
            : null,
          editedAt: null,
          deletedAt: null,
          createdAt: isoNow(),
          pending: true,
        },
      ]);
      setDraft("");
      localStorage.removeItem(draftKey(active.threadId));
      setReply(null);
      if (composerRef.current) composerRef.current.style.height = "auto";
    } else {
      setMessages((prev) => prev.map((m) => (m.id === replaceId ? { ...m, pending: true, failed: false } : m)));
    }
    setSending(true);
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
    try {
      const res = await chatApi.send(active.threadId, { body, replyToId });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? res.data : m)));
      void loadList();
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setAviso(errMsg(err, "No se pudo enviar"));
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!active || !canWrite) return;
    setSending(true);
    try {
      const uploaded = await chatApi.upload(file);
      const res = await chatApi.send(active.threadId, {
        kind: uploaded.kind,
        body: uploaded.filename,
        payload: uploaded,
      });
      setMessages((prev) => [...prev, res.data]);
      void loadList();
      requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
    } catch (err) {
      setAviso(errMsg(err, "No se pudo adjuntar"));
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!active || !hasMore || messages.length === 0) return;
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const page = await chatApi.messages(active.threadId, messages[0].id);
    setHasMore(page.data.hasMore);
    setMessages((prev) => [...page.data.messages, ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  function onDraft(value: string) {
    setDraft(value);
    if (active) localStorage.setItem(draftKey(active.threadId), value);
    if (!active || !canWrite) return;
    const now = nowMs();
    if (now - typingAt.current > 2000) {
      typingAt.current = now;
      void chatApi.typing(active.threadId);
    }
  }

  function runSearch(q: string) {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      if (q.trim().length < 2) {
        setSearchHits(null);
        return;
      }
      const res = await chatApi.search(q.trim());
      setSearchHits(res.data.messages);
    }, 280);
  }

  function jumpToLatest() {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    setShowJump(false);
    setPendingNew(0);
    atBottom.current = true;
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = gap < 80;
    atBottom.current = bottom;
    setShowJump(!bottom);
    if (bottom) setPendingNew(0);
  }

  function closeThread() {
    setActive(null);
    setMessages([]);
    router.replace("/mensajes");
  }

  return (
    <div
      className="flex-1 min-h-0 flex relative"
      onDragOver={(e) => {
        e.preventDefault();
        if (active) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void sendFile(file);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-30 bg-brand-600/25 backdrop-blur-[2px] flex items-center justify-center text-sm text-white pointer-events-none">
          Soltá la foto o el archivo acá
        </div>
      )}
      <aside className={`${active ? "hidden lg:flex" : "flex"} w-full lg:w-[22rem] flex-shrink-0 border-r border-surface-800 flex-col min-h-0 bg-surface-950`}>
        <div className="p-3 border-b border-surface-800">
          <div className="flex items-center justify-between mb-2.5">
            <h1 className="text-base font-semibold text-white">Mensajes</h1>
            <button
              type="button"
              title={soundOn ? "Silenciar sonido" : "Activar sonido"}
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setChatSoundEnabled(next);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-surface-500 hover:text-white hover:bg-surface-800"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
          {!connected && (
            <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 mb-2">
              Reconectando…
            </p>
          )}
          {notifyAsk && (
            <button
              type="button"
              onClick={async () => {
                await Notification.requestPermission();
                setNotifyAsk(Notification.permission === "default");
              }}
              className="w-full text-left text-[11px] text-brand-200 bg-brand-600/10 border border-brand-600/20 rounded-lg px-2.5 py-2 mb-2 leading-snug"
            >
              Activá avisos para no perder un pedido
            </button>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                runSearch(e.target.value);
              }}
              placeholder="Buscar"
              className="w-full bg-surface-800 border border-surface-700 rounded-full pl-9 pr-8 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
            />
            {filter && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white"
                onClick={() => {
                  setFilter("");
                  setSearchHits(null);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-2">
              <MessageSquare className="w-8 h-8 text-surface-600" />
              <p className="text-sm text-surface-300">Todavía no hay conversaciones</p>
              <p className="text-xs text-surface-500 leading-relaxed max-w-[16rem]">
                El chat nace con el vínculo. Cuando un comercio se conecta con un distribuidor, el hilo queda acá — aunque cambie el vendedor.
              </p>
            </div>
          ) : (
            <>
              {visibleThreads.map((item) => {
                const selected = active?.linkId === item.linkId;
                const unread = item.unreadCount > 0;
                return (
                  <button
                    key={item.linkId}
                    type="button"
                    onClick={() => (item.threadId ? openThread(item.threadId) : openLink(item.linkId))}
                    className={`w-full text-left px-3 py-2.5 flex gap-3 transition-colors ${
                      selected ? "bg-brand-600/12" : "hover:bg-surface-900"
                    }`}
                  >
                    <span className="relative flex-shrink-0 mt-0.5">
                      <span className={`w-11 h-11 rounded-full text-xs font-semibold flex items-center justify-center ${avatarTone(item.peer.name)}`}>
                        {initials(item.peer.name)}
                      </span>
                      {item.peerOnline && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-surface-950" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-sm truncate flex-1 ${unread ? "text-white font-semibold" : "text-surface-100"}`}>
                          {item.peer.name}
                        </span>
                        <span className={`text-[11px] tabular-nums flex-shrink-0 ${unread ? "text-brand-300" : "text-surface-500"}`}>
                          {listWhen(item.lastMessageAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[12px] truncate flex-1 ${unread ? "text-surface-200" : "text-surface-500"}`}>
                          {item.lastMessage
                            ? `${item.lastMessage.author ? `${item.lastMessage.author}: ` : ""}${item.lastMessage.text}`
                            : "Todavía no hablaron"}
                        </span>
                        {unread && (
                          <span className="bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[1.15rem] h-4 px-1 flex items-center justify-center">
                            {item.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filter.trim().length >= 2 && searchHits && (
                <div className="border-t border-surface-800 mt-1">
                  <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-surface-500">En los mensajes</p>
                  {searchHits.length === 0 ? (
                    <p className="text-xs text-surface-500 px-3 py-3">Nada coincide con “{filter.trim()}”.</p>
                  ) : (
                    searchHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => {
                          setSearchHits(null);
                          setFilter("");
                          void openThread(hit.threadId);
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-900"
                      >
                        <p className="text-[11px] text-brand-300">{hit.peerName}</p>
                        <p className="text-sm text-surface-200 truncate">{hit.body}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
              {filter && visibleThreads.length === 0 && !searchHits && (
                <p className="text-xs text-surface-500 px-4 py-6 text-center">Ninguna cuenta coincide.</p>
              )}
            </>
          )}
        </div>
      </aside>
      <section className={`${active ? "flex" : "hidden lg:flex"} flex-1 min-w-0 flex-col bg-surface-900/40`}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-800 flex items-center justify-center mb-1">
              <MessageSquare className="w-7 h-7 text-brand-400" />
            </div>
            <p className="text-sm font-medium text-white">Elegí una conversación</p>
            <p className="text-xs text-surface-500 max-w-xs leading-relaxed">
              Es el hilo de la cuenta, no de una persona. Si cambia el vendedor, la historia queda.
            </p>
          </div>
        ) : (
          <>
            <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950/90 backdrop-blur px-2 sm:px-3 py-2 flex items-center gap-2">
              <button type="button" className="lg:hidden w-10 h-10 flex items-center justify-center text-surface-300" onClick={closeThread} aria-label="Volver">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button type="button" className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-lg px-1 py-1 hover:bg-surface-800/60" onClick={() => setHeaderOpen((v) => !v)}>
                <span className={`w-9 h-9 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0 ${avatarTone(active.peer.name)}`}>
                  {initials(active.peer.name)}
                </span>
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                    {active.peer.name}
                    {active.peerOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                  </span>
                  <span className="text-[11px] text-surface-500 truncate block">
                    {active.peerOnline ? "En línea" : active.accountManager ? `Vendedor: ${active.accountManager.username}` : "Sin vendedor asignado"}
                  </span>
                </span>
              </button>
              {loadingThread && <Loader2 className="w-4 h-4 animate-spin text-brand-500" />}
              <button
                type="button"
                title={muted ? "Activar avisos" : "Silenciar"}
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  setChatMuted(active.threadId, next);
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full text-surface-500 hover:text-white hover:bg-surface-800"
              >
                {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </button>
            </header>
            {headerOpen && (
              <div className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 py-3 text-[12px] text-surface-400 flex flex-wrap gap-x-4 gap-y-2">
                {active.peer.contactPhone && (
                  <a href={`tel:${active.peer.contactPhone}`} className="inline-flex items-center gap-1.5 text-brand-300">
                    <Phone className="w-3.5 h-3.5" /> {active.peer.contactPhone}
                  </a>
                )}
                {active.peer.contactEmail && (
                  <a href={`mailto:${active.peer.contactEmail}`} className="text-brand-300">
                    {active.peer.contactEmail}
                  </a>
                )}
                {active.peerHref && (
                  <Link href={active.peerHref} className="text-brand-300">
                    Ver ficha
                  </Link>
                )}
                {active.status !== "ACTIVE" && <span>Vínculo {active.status.toLowerCase()}</span>}
              </div>
            )}
            {active.pins.length > 0 && (
              <div className="flex-shrink-0 border-b border-surface-800 px-4 py-2 flex flex-col gap-1 bg-amber-500/5">
                {active.pins.map((pin) => (
                  <div key={pin.id} className="flex items-center gap-2 text-[12px] text-amber-200">
                    <Pin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate flex-1">{pin.body || pin.kind}</span>
                    {canWrite && (
                      <button type="button" className="w-7 h-7 flex items-center justify-center" onClick={async () => setActive((await chatApi.unpin(active.threadId, pin.id)).data)}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-3 sm:px-5 py-3 flex flex-col min-h-full">
                {hasMore && (
                  <button type="button" onClick={() => void loadOlder()} className="text-[12px] text-brand-300 self-center py-2 px-3 rounded-full hover:bg-surface-800">
                    Ver anteriores
                  </button>
                )}
                {messages.map((msg, i) => {
                  const prev = messages[i - 1];
                  const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(msg.createdAt);
                  const grouped = Boolean(prev) && !showDay && sameAuthorClose(prev, msg);
                  const seen = Boolean(msg.author?.id === me && peerSeenAt && new Date(msg.createdAt).getTime() <= peerSeenAt);
                  return (
                    <div key={msg.id} className="flex flex-col">
                      {showDay && (
                        <p className="self-center text-[11px] text-surface-400 bg-surface-950/80 border border-surface-800 rounded-full px-3 py-1 my-3 capitalize">
                          {dayLabel(msg.createdAt)}
                        </p>
                      )}
                      {firstUnreadId === msg.id && (
                        <p className="text-[11px] text-brand-300 text-center py-1.5 my-1 border-y border-brand-600/20">
                          Mensajes nuevos
                        </p>
                      )}
                      <ChatBubble
                        msg={msg}
                        mine={msg.author?.id === me}
                        grouped={grouped}
                        canWrite={canWrite}
                        seen={seen}
                        onReply={() => {
                          setReply(msg);
                          composerRef.current?.focus();
                        }}
                        onPin={async () => setActive((await chatApi.pin(active.threadId, msg.id)).data)}
                        onDelete={async () => {
                          const updated = await chatApi.remove(msg.id);
                          setMessages((prevMsgs) => prevMsgs.map((m) => (m.id === updated.data.id ? updated.data : m)));
                        }}
                        onImage={setLightbox}
                        onUpdated={(updated) => setMessages((prevMsgs) => prevMsgs.map((m) => (m.id === updated.id ? updated : m)))}
                        onRetry={msg.failed ? () => void sendText(msg.body, msg.replyTo?.id, msg.id) : undefined}
                      />
                    </div>
                  );
                })}
                {typing.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 text-[12px] text-surface-400 px-1">
                    <span className="inline-flex gap-0.5 items-end h-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce [animation-delay:120ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-bounce [animation-delay:240ms]" />
                    </span>
                    {typing.map((t) => t.username).join(", ")} {typing.length === 1 ? "está escribiendo" : "están escribiendo"}
                  </div>
                )}
              </div>
            </div>
            {showJump && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-24 right-4 lg:right-8 bg-surface-800 border border-surface-600 text-white rounded-full px-3 py-2 text-[12px] flex items-center gap-1.5 shadow-xl"
              >
                <ChevronDown className="w-4 h-4" />
                {pendingNew > 0 ? `${pendingNew} nuevo${pendingNew === 1 ? "" : "s"}` : "Ir al final"}
              </button>
            )}
            {aviso && <p className="text-xs text-red-300 px-4 py-1.5 text-center">{aviso}</p>}
            {reply && (
              <div className="max-w-3xl mx-auto w-full px-3 sm:px-5 py-2 text-[12px] text-surface-400 border-t border-surface-800 flex items-center gap-2">
                <span className="w-0.5 h-8 bg-brand-500 rounded-full" />
                <span className="truncate flex-1">
                  Respondiendo a {reply.author?.username ?? "sistema"}: {reply.body || reply.kind}
                </span>
                <button type="button" className="w-8 h-8 flex items-center justify-center" onClick={() => setReply(null)}><X className="w-4 h-4" /></button>
              </div>
            )}
            {canWrite ? (
              <form
                className="flex-shrink-0 border-t border-surface-800 bg-surface-950 px-2 sm:px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendText();
                }}
              >
                <div className="max-w-3xl mx-auto flex items-end gap-1.5">
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.xls,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void sendFile(file);
                    }}
                  />
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-10 h-10 flex items-center justify-center text-surface-400 hover:text-white rounded-full hover:bg-surface-800" title="Adjuntar">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(e) => {
                      onDraft(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                    }}
                    onPaste={(e) => {
                      const file = [...e.clipboardData.files][0];
                      if (file) {
                        e.preventDefault();
                        void sendFile(file);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendText();
                      }
                    }}
                    rows={1}
                    placeholder="Mensaje"
                    className="flex-1 bg-surface-800 border border-surface-700 rounded-[1.25rem] px-4 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500 resize-none max-h-32 leading-snug"
                  />
                  <button type="submit" disabled={sending || !draft.trim()} className="w-10 h-10 flex items-center justify-center bg-brand-600 hover:bg-brand-500 disabled:opacity-30 text-white rounded-full">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-[12px] text-surface-500 px-4 py-3 border-t border-surface-800 text-center">Tu rol es de solo lectura.</p>
            )}
          </>
        )}
      </section>
      {lightbox && (
        <button type="button" className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 sm:p-8" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(lightbox)} alt="" className="max-h-full max-w-full rounded-xl" />
        </button>
      )}
    </div>
  );
}
