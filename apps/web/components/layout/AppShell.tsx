"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AuthGuard from "../AuthGuard";
import ImpersonationBanner from "../ImpersonationBanner";
import PendingBrandLinkBanner from "../brands/PendingBrandLinkBanner";
import MobileTopBar from "./MobileTopBar";
import Sidebar from "./Sidebar";
import TenantRouteGate from "../org/TenantRouteGate";
import OnboardingGate from "../onboarding/OnboardingGate";
import ChatRealtime from "../chat/ChatRealtime";
import CartFloat from "../CartFloat";
import SessionKeepAlive from "../SessionKeepAlive";
import SubscriptionBanner from "../subscription/SubscriptionBanner";
import SuspendedGate from "../subscription/SuspendedGate";
import SellerRouteGate from "../sale-margins/SellerRouteGate";
import AnnouncementGate from "../announcements/AnnouncementGate";
import { SellerPreviewBar } from "../sale-margins/SellerModeSettings";
import { QuotesProvider } from "@/lib/quotes";
import QuoteFloat from "../quotes/QuoteFloat";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <AuthGuard>
      <SessionKeepAlive />
      <ChatRealtime />
      <OnboardingGate>
        <QuotesProvider>
          <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
            <ImpersonationBanner />
            <PendingBrandLinkBanner />
            <SubscriptionBanner />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <MobileTopBar onOpen={() => setMobileOpen(true)} />
              {mobileOpen && (
                <div
                  onClick={() => setMobileOpen(false)}
                  className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                />
              )}
              <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
                <TenantRouteGate>
                  <SuspendedGate>
                    <SellerRouteGate>{children}</SellerRouteGate>
                  </SuspendedGate>
                </TenantRouteGate>
              </div>
            </div>
          </div>
          <CartFloat />
          <QuoteFloat />
          <AnnouncementGate />
          <SellerPreviewBar />
        </QuotesProvider>
      </OnboardingGate>
    </AuthGuard>
  );
}
