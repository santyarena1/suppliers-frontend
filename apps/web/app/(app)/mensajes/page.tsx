"use client";

import ChatApp from "@/components/chat/ChatApp";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Inner() {
  const params = useSearchParams();
  return <ChatApp initialLinkId={params.get("linkId") ?? undefined} />;
}

export default function MensajesPage() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Suspense>
        <Inner />
      </Suspense>
    </div>
  );
}
