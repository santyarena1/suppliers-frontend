"use client";

import ChatApp from "@/components/chat/ChatApp";
import { useParams } from "next/navigation";

export default function MensajeHiloPage() {
  const params = useParams<{ threadId: string }>();
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ChatApp initialThreadId={params.threadId} />
    </div>
  );
}
