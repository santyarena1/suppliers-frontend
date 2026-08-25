"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import ChatThread from "@/components/ChatThread";
import { ArrowLeft } from "lucide-react";
import { getTenant } from "@/lib/auth";

export default function ChatConversationPage() {
  const params = useParams<{ linkId: string }>();
  const back = getTenant()?.type === "DISTRIBUTOR" ? "/cartera" : "/proveedores";

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-surface-400 hover:text-white" aria-label="Volver al chat">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-base font-semibold text-white">Chat</h1>
            <p className="text-xs text-surface-500">
              <Link href={back} className="hover:text-surface-300">Volver</Link>
            </p>
          </div>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          <ChatThread linkId={params.linkId} />
        </div>
      </div>
    </>
  );
}
