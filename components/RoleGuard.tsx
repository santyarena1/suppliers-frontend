"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, type UserRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";

interface Props {
  allowed: UserRole[];
  redirectTo?: string;
  children: React.ReactNode;
}

export default function RoleGuard({ allowed, redirectTo = "/search", children }: Props) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || !allowed.includes(user.role as UserRole)) {
      router.replace(redirectTo);
      return;
    }
    setOk(true);
  }, [allowed, redirectTo, router]);

  if (!ok) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return <>{children}</>;
}
