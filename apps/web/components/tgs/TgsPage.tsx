"use client";

import PrefsPanel from "@/components/PrefsPanel";

interface Props {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function TgsPage({ title, subtitle, action, children }: Props) {
  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white truncate">{title}</h1>
          {subtitle && <p className="text-xs text-surface-500 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          <PrefsPanel />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">{children}</div>
      </div>
    </>
  );
}
