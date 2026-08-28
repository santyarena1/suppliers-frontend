"use client";

import ContextNav from "@/components/layout/ContextNav";
import TgsGate from "@/components/tgs/TgsGate";
import { TGS_NAV } from "@/lib/tgs-nav";

export default function SistemaTgsLayout({ children }: { children: React.ReactNode }) {
  return (
    <TgsGate>
      <ContextNav items={TGS_NAV}>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
      </ContextNav>
    </TgsGate>
  );
}
