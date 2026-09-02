"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, persistAuthCookie } from "@/lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      persistAuthCookie(token);
      setAuthed(true);
    } else {
      setAuthed(false);
      router.replace("/login");
    }
  }, [router]);

  if (authed !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="w-8 h-8 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
