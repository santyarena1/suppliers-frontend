"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ChatApp from "@/components/chat/ChatApp";

/**
 * El chat vive en el layout para que pasar de /mensajes a /mensajes/:id
 * no desmonte la lista ni pierda el borrador.
 */
function ChatShell() {
  const pathname = usePathname();
  const params = useSearchParams();
  const parts = pathname.split("/").filter(Boolean);
  const threadId = parts[0] === "mensajes" && parts[1] ? parts[1] : undefined;
  return (
    <ChatApp
      initialThreadId={threadId}
      initialLinkId={params.get("linkId") ?? undefined}
    />
  );
}

export default function MensajesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-surface-500 text-sm">
            Cargando mensajes…
          </div>
        }
      >
        <ChatShell />
      </Suspense>
      {children}
    </div>
  );
}
