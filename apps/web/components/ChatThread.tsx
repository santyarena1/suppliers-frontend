"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { chatApi, type ChatMessage } from "@/lib/api";

export default function ChatThread({
  linkId,
  otherName,
}: {
  linkId: string;
  otherName?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [title, setTitle] = useState(otherName ?? "");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await chatApi.thread(linkId);
      setMessages(res.data.messages);
      setCanWrite(res.data.canWrite);
      setTitle(res.data.otherName);
      setError(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cargar el chat");
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await chatApi.post(linkId, text.trim());
      setMessages((prev) => [...prev, res.data]);
      setText("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo enviar");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[320px] max-h-[520px] bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-800">
        <p className="text-sm font-semibold text-white">{title || "Chat"}</p>
        <p className="text-[11px] text-surface-500">Conversación de este vínculo. No sale de acá.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages.length === 0 && (
          <p className="text-xs text-surface-500 text-center py-8">Todavía no hay mensajes.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                msg.mine ? "bg-brand-600 text-white" : "bg-surface-800 text-surface-100"
              }`}
            >
              {!msg.mine && (
                <p className="text-[10px] font-medium opacity-70 mb-0.5">
                  {msg.sender.username} · {msg.sender.tenantName}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
              <p className={`text-[10px] mt-1 ${msg.mine ? "text-white/70" : "text-surface-500"}`}>
                {new Date(msg.createdAt).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {error && <p className="text-xs text-red-400 px-4 pb-1">{error}</p>}
      {canWrite ? (
        <form onSubmit={send} className="flex gap-2 p-3 border-t border-surface-800">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="Escribí un mensaje"
            className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg px-3 py-2"
            aria-label="Enviar"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      ) : (
        <p className="text-xs text-surface-500 px-4 py-3 border-t border-surface-800">Solo lectura.</p>
      )}
    </div>
  );
}
