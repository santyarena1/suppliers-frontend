"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  chatApi,
  type ChatMessage,
  type ChatThreadDetail,
  type ChatThreadSummary,
} from "@/lib/api";
import { getUser } from "@/lib/auth";
import { assetUrl } from "@/lib/assets";
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
  ArrowLeft, Bell, BellOff, ChevronDown, Loader2, Paperclip, Phone, Pin, Search, Send, Volume2, VolumeX, X,
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

  useEffect(() => {
    setSoundOn(chatSoundEnabled());
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setNotifyAsk(true);
    }
  }, []);

  useEffect(() => {
    setActiveChatThread(active?.threadId ?? null);
    setMuted(active ? isChatMuted(active.threadId) : false);
    return () => setActiveChatThread(null);
  }, [active?.threadId]);

  const loadList = useCallback(async () => {
    const res = await chatApi.threads();
    setThreads(res.data.threads);
    setCanWrite(res.data.canWrite);
    setChatUnread(res.data.unreadTotal);
    setLoadingList(false);
    return res.data.threads;
  }, []);

  const openLink = useCallback(async (linkId: string) => {
    setLoadingThread(true);
    try {
      const opened = await chatApi.open(linkId);
      setActive(opened.data);
      const page = await chatApi.messages(opened.data.threadId);
      setMessages(page.data.messages);
      setHasMore(page.data.hasMore);
      setReply(null);
      setDraft(localStorage.getItem(draftKey(opened.data.threadId)) ?? "");
      await chatApi.read(opened.data.threadId);
      router.replace(`/mensajes/${opened.data.threadId}`);
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
  }, [loadList, router]);

  const openThread = useCallback(async (threadId: string) => {
    setLoadingThread(true);
    try {
      const [detail, page] = await Promise.all([chatApi.thread(threadId), chatApi.messages(threadId)]);
      setActive(detail.data);
      setMessages(page.data.messages);
      setHasMore(page.data.hasMore);
      setReply(null);
      setDraft(localStorage.getItem(draftKey(threadId)) ?? "");
      await chatApi.read(threadId);
      router.replace(`/mensajes/${threadId}`);
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
  }, [loadList, router]);

  useEffect(() => {
    loadList()
      .then((list) => {
        if (initialThreadId) return openThread(initialThreadId);
        if (initialLinkId) return openLink(initialLinkId);
        if (typeof window !== "undefined" && window.innerWidth >= 1024 && list[0]) {
          if (list[0].threadId) return openThread(list[0].threadId);
          return openLink(list[0].linkId);
        }
      })
      .catch((err) => {
        setAviso(errMsg(err, "No se pudieron cargar las conversaciones"));
        setLoadingList(false);
      });
    // Solo al montar / al cambiar el destino inicial.
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return subscribeChatEvents((type, payload) => {
      if (type === "message") {
        const msg = payload.data as ChatMessage;
        if (msg.threadId === active?.threadId) {
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
      if (type === "read" && payload.threadId === active?.threadId) {
        const data = payload.data as { userId: string; lastReadAt: string };
        if (data.userId !== me) {
          setActive((prev) =>
            prev
              ? {
                  ...prev,
                  peerLastReadAt: data.lastReadAt,
                  peerReads: [
                    ...(prev.peerReads ?? []).filter((row) => row.userId !== data.userId),
                    { userId: data.userId, username: "", lastReadAt: data.lastReadAt },
                  ],
                }
              : prev
          );
        }
      }
      if (type === "typing" && payload.threadId === active?.threadId) {
        setTyping((payload.data as { userId: string; username: string }[]).filter((row) => row.userId !== me));
      }
      if (type === "presence") {
        void loadList();
        if (active?.threadId) {
          void chatApi.thread(active.threadId).then((res) => setActive(res.data));
        }
      }
    });
  }, [active, active?.threadId, loadList, me]);

  const visibleThreads = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle || searchHits) return threads;
    return threads.filter(
      (t) => t.peer.name.toLowerCase().includes(needle) || (t.lastMessage?.text ?? "").toLowerCase().includes(needle)
    );
  }, [filter, searchHits, threads]);

  const firstUnreadId = useMemo(() => {
    if (!active?.lastReadAt) return messages.find((m) => m.author?.id !== me)?.id;
    const at = new Date(active.lastReadAt).getTime();
    return messages.find((m) => m.author?.id !== me && new Date(m.createdAt).getTime() > at)?.id;
  }, [active?.lastReadAt, me, messages]);

  const peerSeenAt = active?.peerLastReadAt ? new Date(active.peerLastReadAt).getTime() : 0;

  async function sendText() {
    if (!active || !draft.trim() || sending || !canWrite) return;
    const body = draft.trim();
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
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
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    localStorage.removeItem(draftKey(active.threadId));
    const replyId = reply?.id;
    setReply(null);
    setSending(true);
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
    try {
      const res = await chatApi.send(active.threadId, { body, replyToId: replyId });
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
    const now = Date.now();
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
    }, 250);
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

  return (
    <div
      className="flex-1 min-h-0 flex relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
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
        <div className="absolute inset-0 z-30 bg-brand-600/20 border-2 border-dashed border-brand-400 flex items-center justify-center text-sm text-white pointer-events-none">
          Soltá la foto o el archivo
        </div>
      )}
      <aside className={`${active ? "hidden lg:flex" : "flex"} w-full lg:w-80 flex-shrink-0 border-r border-surface-800 flex-col min-h-0 bg-surface-950`}>
        <div className="p-3 border-b border-surface-800">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-sm font-semibold text-white">Mensajes</h1>
            <button
              type="button"
              title={soundOn ? "Silenciar sonido" : "Activar sonido"}
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setChatSoundEnabled(next);
              }}
              className="text-surface-500 hover:text-white"
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
          {!connected && (
            <p className="text-[11px] text-amber-300 mb-2">Reconectando el chat…</p>
          )}
          {notifyAsk && (
            <button
              type="button"
              onClick={async () => {
                await Notification.requestPermission();
                setNotifyAsk(Notification.permission === "default");
              }}
              className="w-full text-left text-[11px] text-brand-300 bg-brand-600/10 border border-brand-600/20 rounded-md px-2 py-1.5 mb-2"
            >
              Activá avisos del navegador para no perder un pedido
            </button>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-surface-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                runSearch(e.target.value);
              }}
              placeholder="Buscar comercio o texto"
              className="w-full bg-surface-800 border border-surface-700 rounded-md pl-8 pr-2 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : searchHits ? (
            searchHits.length === 0 ? (
              <p className="text-xs text-surface-500 p-4">Nada coincide.</p>
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
                  className="w-full text-left px-3 py-2.5 border-b border-surface-800 hover:bg-surface-900"
                >
                  <p className="text-xs text-brand-400">{hit.peerName}</p>
                  <p className="text-sm text-surface-200 truncate">{hit.body}</p>
                </button>
              ))
            )
          ) : visibleThreads.length === 0 ? (
            <p className="text-xs text-surface-500 p-4 leading-relaxed">
              El chat nace con el vínculo. Cuando un comercio se conecta con un distribuidor, la conversación queda acá — aunque cambie el vendedor.
            </p>
          ) : (
            visibleThreads.map((item) => {
              const selected = active?.linkId === item.linkId;
              return (
                <button
                  key={item.linkId}
                  type="button"
                  onClick={() => (item.threadId ? openThread(item.threadId) : openLink(item.linkId))}
                  className={`w-full text-left px-3 py-2.5 border-b border-surface-800 ${selected ? "bg-brand-600/10" : "hover:bg-surface-900"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex-shrink-0">
                      <span className="w-8 h-8 rounded-full bg-surface-800 text-[11px] font-semibold text-surface-300 flex items-center justify-center">
                        {item.peer.name.slice(0, 2).toUpperCase()}
                      </span>
                      {item.peerOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-surface-950" />
                      )}
                    </span>
                    <p className="text-sm text-white truncate flex-1">{item.peer.name}</p>
                    {item.lastMessageAt && (
                      <span className="text-[10px] text-surface-500 tabular-nums">
                        {new Date(item.lastMessageAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {item.unreadCount > 0 && (
                      <span className="bg-brand-600 text-white text-[10px] font-bold rounded-full min-w-[1.15rem] h-4 px-1 flex items-center justify-center">
                        {item.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-surface-500 truncate pl-10">
                    {item.lastMessage
                      ? `${item.lastMessage.author ? `${item.lastMessage.author}: ` : ""}${item.lastMessage.text}`
                      : "Todavía no hablaron"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </aside>
      <section className={`${active ? "flex" : "hidden lg:flex"} flex-1 min-w-0 flex-col bg-surface-950`}>
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-surface-500 px-6 text-center">
            Elegí una conversación. Es el hilo de la cuenta, no de una persona.
          </div>
        ) : (
          <>
            <header className="flex-shrink-0 border-b border-surface-800 px-3 py-2.5 flex items-center gap-2">
              <button type="button" className="lg:hidden text-surface-400" onClick={() => { setActive(null); router.replace("/mensajes"); }}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setHeaderOpen((v) => !v)}>
                <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                  {active.peer.name}
                  {active.peerOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </p>
                <p className="text-[11px] text-surface-500 truncate">
                  {active.peerOnline ? "En línea" : active.accountManager ? `Vendedor: ${active.accountManager.username}` : "Sin vendedor asignado"}
                  {active.peer.contactPhone ? ` · ${active.peer.contactPhone}` : ""}
                </p>
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
                className="text-surface-500 hover:text-white"
              >
                {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </button>
            </header>
            {headerOpen && (
              <div className="flex-shrink-0 border-b border-surface-800 px-3 py-2 text-[11px] text-surface-400 flex flex-wrap gap-3">
                {active.peer.contactPhone && (
                  <a href={`tel:${active.peer.contactPhone}`} className="inline-flex items-center gap-1 text-brand-300">
                    <Phone className="w-3 h-3" /> {active.peer.contactPhone}
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
                {active.status !== "ACTIVE" && <span>Vínculo: {active.status}</span>}
              </div>
            )}
            {active.pins.length > 0 && (
              <div className="flex-shrink-0 border-b border-surface-800 px-3 py-2 flex flex-col gap-1 bg-surface-900/50">
                {active.pins.map((pin) => (
                  <div key={pin.id} className="flex items-center gap-2 text-[11px] text-amber-300">
                    <Pin className="w-3 h-3" />
                    <span className="truncate flex-1">{pin.body || pin.kind}</span>
                    {canWrite && (
                      <button type="button" onClick={async () => setActive((await chatApi.unpin(active.threadId, pin.id)).data)}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col">
              {hasMore && (
                <button type="button" onClick={() => void loadOlder()} className="text-[11px] text-brand-400 self-center py-1">
                  Ver anteriores
                </button>
              )}
              {messages.map((msg, i) => {
                const prev = messages[i - 1];
                const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(msg.createdAt);
                const grouped = Boolean(prev) && !showDay && sameAuthorClose(prev, msg);
                const seen = Boolean(msg.author?.id === me && peerSeenAt && new Date(msg.createdAt).getTime() <= peerSeenAt);
                return (
                  <div key={msg.id}>
                    {showDay && (
                      <p className="text-[10px] uppercase tracking-wide text-surface-500 text-center py-2">
                        {dayLabel(msg.createdAt)}
                      </p>
                    )}
                    {firstUnreadId === msg.id && (
                      <p className="text-[10px] text-brand-300 text-center py-1 border-t border-brand-600/30 mb-2">
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
                    />
                  </div>
                );
              })}
              {typing.length > 0 && (
                <p className="text-[11px] text-surface-500 px-1 mt-2">
                  {typing.map((t) => t.username).join(", ")} {typing.length === 1 ? "está escribiendo…" : "están escribiendo…"}
                </p>
              )}
            </div>
            {showJump && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-24 right-4 bg-surface-800 border border-surface-600 text-white rounded-full px-3 py-1.5 text-[11px] flex items-center gap-1 shadow-lg"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                {pendingNew > 0 ? `${pendingNew} nuevo${pendingNew === 1 ? "" : "s"}` : "Ir al final"}
              </button>
            )}
            {aviso && <p className="text-xs text-red-400 px-3 py-1">{aviso}</p>}
            {reply && (
              <div className="px-3 py-1.5 text-[11px] text-surface-400 border-t border-surface-800 flex items-center gap-2">
                <span className="truncate flex-1">Respondiendo a {reply.author?.username ?? "sistema"}: {reply.body}</span>
                <button type="button" onClick={() => setReply(null)}><X className="w-3 h-3" /></button>
              </div>
            )}
            {canWrite ? (
              <form
                className="flex-shrink-0 border-t border-surface-800 p-2 flex items-end gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendText();
                }}
              >
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
                <button type="button" onClick={() => fileRef.current?.click()} className="text-surface-500 hover:text-white p-2" title="Adjuntar">
                  <Paperclip className="w-4 h-4" />
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
                  placeholder="Escribí. Enter envía, Shift+Enter baja de línea."
                  className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 resize-none max-h-32"
                />
                <button type="submit" disabled={sending || !draft.trim()} className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg p-2">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            ) : (
              <p className="text-[11px] text-surface-500 px-3 py-2 border-t border-surface-800">Tu rol es de solo lectura.</p>
            )}
          </>
        )}
      </section>
      {lightbox && (
        <button type="button" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(lightbox)} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </div>
  );
}
