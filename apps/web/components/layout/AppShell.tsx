"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AuthGuard from "../AuthGuard";
import ImpersonationBanner from "../ImpersonationBanner";
import MobileTopBar from "./MobileTopBar";
import Sidebar from "./Sidebar";
import TenantRouteGate from "../org/TenantRouteGate";
import ChatRealtime from "../chat/ChatRealtime";
import CartFloat from "../CartFloat";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <AuthGuard>
      <ChatRealtime />
      <div className="flex h-screen flex-col overflow-hidden">
        <ImpersonationBanner />
        <div className="flex flex-1 overflow-hidden">
          <MobileTopBar onOpen={() => setMobileOpen(true)} />
          {mobileOpen && (
            <div
              onClick={() => setMobileOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
          )}
          <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
            <TenantRouteGate>{children}</TenantRouteGate>
          </div>
        </div>
      </div>
      <CartFloat />
    </AuthGuard>
  );
}
