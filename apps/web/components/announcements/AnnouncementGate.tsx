"use client";

import { useCallback, useEffect, useState } from "react";
import { announcementsApi } from "@/lib/api";
import { getImpersonator, getTenant, getUser } from "@/lib/auth";
import { useMyProviders } from "@/lib/myProviders";
import { useOnboarding } from "@/lib/onboarding";
import { useCan } from "@/lib/permissions";
import { useSellerSession } from "@/lib/sale-price";
import { SELLER_MODE_ANNOUNCEMENT, SELLER_MODE_ANNOUNCEMENT_ENABLED } from "@/lib/sale-margins";
import { useSubscription } from "@/lib/subscription";
import SellerModeAnnouncement, { type SellerModeAudience } from "./SellerModeAnnouncement";

/** Espera para no tapar la primera pintura de la pantalla. */
const SHOW_DELAY_MS = 1200;

function localKey(key: string, userId: string) {
  return `nodo.announcement.${key}.${userId}`;
}

function seenLocally(key: string, userId: string): boolean {
  try {
    return localStorage.getItem(localKey(key, userId)) === "1";
  } catch {
    return false;
  }
}

function markLocally(key: string, userId: string) {
  try {
    localStorage.setItem(localKey(key, userId), "1");
  } catch {
    /* sin storage queda el registro del servidor */
  }
}

/**
 * Aviso de novedad del modo vendedor: a cada persona una sola vez. Se guarda en
 * el servidor (`seenAnnouncements`) y además en el navegador, para no repetirlo
 * aunque el servidor no responda. No aparece en el recorrido guiado ni al
 * "Entrar como" otra cuenta.
 */
export default function AnnouncementGate() {
  const key = SELLER_MODE_ANNOUNCEMENT;
  const user = getUser();
  const userId = user?.id ?? null;
  const onboarding = useOnboarding();
  const seller = useSellerSession();
  const { subscription, loading: subLoading } = useSubscription();
  const canManagePricing = useCan("pricing.manage");
  const { providers } = useMyProviders();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!SELLER_MODE_ANNOUNCEMENT_ENABLED) return;
    if (!userId || getImpersonator() || onboarding.active) return;
    if (subLoading || seenLocally(key, userId)) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      announcementsApi
        .seen()
        .then((res) => {
          const seen = Array.isArray(res.data?.seen) ? res.data.seen : [];
          if (seen.includes(key)) {
            markLocally(key, userId);
            return;
          }
          if (alive) setOpen(true);
        })
        // Si el servidor no sabe responder, se muestra igual: el navegador recuerda que ya se vio.
        .catch(() => {
          if (alive) setOpen(true);
        });
    }, SHOW_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key, userId, onboarding.active, subLoading]);

  const close = useCallback(() => {
    setOpen(false);
    if (!userId) return;
    markLocally(key, userId);
    void announcementsApi.markSeen(key).catch(() => undefined);
  }, [key, userId]);

  if (!open || !userId) return null;

  const tenant = getTenant();
  const retailer = tenant?.type === "RETAILER";
  const manager = canManagePricing ?? (tenant?.role === "OWNER" || tenant?.role === "ADMIN");
  const audience: SellerModeAudience = !retailer
    ? "other"
    : seller.isRealSeller
      ? "seller"
      : !seller.sellerMode
        ? subscription
          ? "base"
          : "other"
        : manager
          ? "manager"
          : "buyer";

  const firstConfigured = providers.find((p) => p.configured && !p.platformHidden);
  const marginsHref = firstConfigured
    ? `/proveedores/${encodeURIComponent(firstConfigured.provider)}?tab=margins`
    : "/proveedores";

  return <SellerModeAnnouncement audience={audience} marginsHref={marginsHref} onClose={close} />;
}
