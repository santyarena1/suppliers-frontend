"use client";

import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import ProvidersSubSidebar from "@/components/ProvidersSubSidebar";

export default function ProveedoresLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />
        <ProvidersSubSidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">{children}</div>
      </div>
    </AuthGuard>
  );
}
