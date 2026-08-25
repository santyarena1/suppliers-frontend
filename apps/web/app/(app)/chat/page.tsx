"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { chatApi, type ChatThreadSummary } from "@/lib/api";
import { Loader2, MessageSquare } from "lucide-react";

export default function ChatInboxPage() {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void chatApi.list()
      .then((res) => setThreads(res.data))
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(msg || "No se pudieron cargar las conversaciones");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Chat</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Un hilo por vínculo, del local al mayorista</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : threads.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-8 h-8 text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-300">No hay conversaciones todavía.</p>
            </div>
          ) : (
            <div className="border border-surface-800 rounded-2xl divide-y divide-surface-800 overflow-hidden">
              {threads.map((thread) => (
                <Link
                  key={thread.linkId}
                  href={`/chat/${thread.linkId}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-surface-800/60"
                >
                  <MessageSquare className="w-4 h-4 text-brand-400 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{thread.otherName}</p>
                    <p className="text-xs text-surface-500 truncate">
                      {thread.lastMessage
                        ? `${thread.lastMessage.fromUs ? "Vos: " : ""}${thread.lastMessage.body}`
                        : "Sin mensajes"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
