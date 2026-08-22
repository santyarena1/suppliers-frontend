"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AuthGuard from "../AuthGuard";
import MobileTopBar from "./MobileTopBar";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <MobileTopBar onOpen={() => setMobileOpen(true)} />
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />
        )}
        <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
