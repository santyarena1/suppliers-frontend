"use client";

import { useCart, type CartItem } from "@/lib/cart";
import { getUser } from "@/lib/auth";
import { personLabel, sharesOf } from "@/lib/cartPeople";
import { PersonDot } from "@/components/cart/OrderPeopleFilter";

/** «Juan 2 · Vos 1»: quién puso las unidades de esta línea. Solo si hay más de un integrante en el equipo. */
export default function LineAuthors({ item }: { item: CartItem }) {
  const { people } = useCart();
  if (Object.keys(people).length < 2) return null;
  const me = getUser()?.id ?? null;
  const shares = Object.entries(sharesOf(item)).sort((a, b) => b[1] - a[1]);
  if (shares.length === 0) return null;
  const single = shares.length === 1;
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-xs text-surface-400">
      {shares.map(([userId, n]) => (
        <span key={userId} className="inline-flex items-center gap-1.5">
          <PersonDot userId={userId} />
          <span className="text-surface-300">{personLabel(userId, people, me)}</span>
          {!single && <span className="tabular-nums text-surface-500">{n}</span>}
        </span>
      ))}
    </p>
  );
}
