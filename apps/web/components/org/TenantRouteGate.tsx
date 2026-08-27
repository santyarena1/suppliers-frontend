"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getTenant, getUser } from "@/lib/auth";
import { tenantRouteRedirect } from "@/lib/tenant-routes";

/** Si la URL no es de este tipo de organización, vuelve al inicio. */
export default function TenantRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const tenant = getTenant();
  const user = getUser();
  const target = tenantRouteRedirect(pathname, tenant?.type, user?.role === "ROLE_ADMIN");

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
