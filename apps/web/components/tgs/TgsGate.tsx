"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { tgsApi } from "@/lib/tgs-api";
import { useState } from "react";

export default function TgsGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");

  useEffect(() => {
    let alive = true;
    tgsApi
      .enabled()
      .then((res) => {
        if (!alive) return;
        if (res.data?.enabled) setState("ok");
        else {
          setState("no");
          router.replace("/");
        }
      })
      .catch(() => {
        if (!alive) return;
        setState("no");
        router.replace("/");
      });
    return () => {
      alive = false;
    };
  }, [router]);

  if (state !== "ok") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
