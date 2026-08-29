"use client";

import { tgsEstadoClass } from "./tgs-format";

export default function TgsBadge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const cls = tone ?? tgsEstadoClass(typeof children === "string" ? children : "");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}
