"use client";

import Link from "next/link";
import { Menu, MessageSquare, ShoppingCart } from "lucide-react";
import { getTenant } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useChatUnread } from "@/lib/chat-unread";
import NodoLogo from "../NodoLogo";
import NodoWordmark from "../NodoWordmark";

interface Props {
  onOpen: () => void;
}

/**
 * En el comercio el atajo del día es el carrito, pero el chat también tiene
 * que estar a un toque: si no, se pierde el mensaje del vendedor. En el
 * distribuidor el atajo es solo mensajes (no hay carrito).
 */
export default function MobileTopBar({ onOpen }: Props) {
  const { totalCount } = useCart();
  const chatUnread = useChatUnread();
  const tenant = getTenant();
  const distributor = tenant?.type === "DISTRIBUTOR";
  const retailer = tenant?.type === "RETAILER";
  const brand = tenant?.type === "BRAND";

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-surface-900 border-b border-surface-800 flex items-center justify-between px-4 h-12">
      <button type="button" onClick={onOpen} className="w-10 h-10 flex items-center justify-center text-surface-300 hover:text-white" aria-label="Abrir menú">
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-1.5">
        <NodoLogo className="w-5 h-5" />
        <NodoWordmark className="h-3.5" />
      </div>
      <div className="flex items-center gap-1">
        {(retailer || distributor || brand) && (
          <Link href="/mensajes" className="relative w-10 h-10 flex items-center justify-center text-surface-300 hover:text-white" aria-label="Mensajes">
            <MessageSquare className="w-5 h-5" />
            {chatUnread > 0 && (
              <span className="absolute top-1 right-1 bg-brand-600 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center">
                {chatUnread > 99 ? "99+" : chatUnread}
              </span>
            )}
          </Link>
        )}
        {retailer && (
          <Link href="/cart" className="relative w-10 h-10 flex items-center justify-center text-surface-300 hover:text-white" aria-label="Carrito">
            <ShoppingCart className="w-5 h-5" />
            {totalCount > 0 && (
              <span className="absolute top-1 right-1 bg-brand-600 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 px-1 flex items-center justify-center">
                {totalCount > 99 ? "99+" : totalCount}
              </span>
            )}
          </Link>
        )}
        {!retailer && !distributor && <span className="w-10" />}
      </div>
    </div>
  );
}
