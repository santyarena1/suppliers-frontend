"use client";

import Link from "next/link";
import { Mail, MessageSquare, Phone, UserRound } from "lucide-react";

export type AssignedSellerInfo = {
  id?: string;
  name: string;
  email: string;
  title?: string | null;
  roleLabel?: string | null;
  orgEmail?: string | null;
  orgPhone?: string | null;
};

function digits(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function whatsappHref(phone: string): string | null {
  const n = digits(phone).replace(/^\+/, "");
  if (n.length < 8) return null;
  const withCountry = n.startsWith("54") ? n : `54${n.replace(/^0/, "")}`;
  return `https://wa.me/${withCountry}`;
}

export default function AssignedSellerCard({
  seller,
  contact,
  linkId,
  compact = false,
}: {
  seller: AssignedSellerInfo | null;
  contact?: { email: string | null; phone: string | null } | null;
  linkId?: string | null;
  compact?: boolean;
}) {
  const orgEmail = seller?.orgEmail || contact?.email || null;
  const orgPhone = seller?.orgPhone || contact?.phone || null;
  const wa = orgPhone ? whatsappHref(orgPhone) : null;
  const roleLine = [seller?.title, seller?.roleLabel].filter(Boolean).join(" · ");

  if (!seller && !orgEmail && !orgPhone) {
    return (
      <div className="rounded-xl border border-surface-800 bg-surface-900 px-4 py-3 text-sm text-surface-500">
        Este distribuidor todavía no te asignó un vendedor.
      </div>
    );
  }

  if (compact) {
    if (seller) {
      return (
        <p className="text-[11px] text-surface-400">
          Tu vendedor: <span className="text-surface-200">{seller.name}</span>
          {roleLine ? ` · ${roleLine}` : ""}
          {seller.email ? ` · ${seller.email}` : ""}
          {orgPhone ? ` · ${orgPhone}` : ""}
        </p>
      );
    }
    if (orgPhone || orgEmail) {
      return (
        <p className="text-[11px] text-surface-400">
          Contacto: {[orgPhone, orgEmail].filter(Boolean).join(" · ")}
        </p>
      );
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-200 flex items-center justify-center flex-shrink-0">
            <UserRound className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Tu vendedor</p>
            {seller ? (
              <>
                <p className="text-sm font-semibold text-white truncate">{seller.name}</p>
                {roleLine && <p className="text-xs text-surface-400">{roleLine}</p>}
              </>
            ) : (
              <p className="text-sm text-surface-300">Todavía no te asignaron un vendedor</p>
            )}
          </div>
        </div>
        {linkId && (
          <Link
            href={`/mensajes?linkId=${linkId}`}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium border border-brand-500/40 hover:border-brand-400 text-brand-200 hover:text-white rounded-lg px-2.5 py-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Hablar
          </Link>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {seller?.email && (
          <>
            <dt className="text-[10px] uppercase tracking-wider text-surface-500 pt-0.5">Email</dt>
            <dd>
              <a href={`mailto:${seller.email}`} className="text-sky-300 hover:text-white inline-flex items-center gap-1.5 break-all">
                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                {seller.email}
              </a>
            </dd>
          </>
        )}
        {orgPhone && (
          <>
            <dt className="text-[10px] uppercase tracking-wider text-surface-500 pt-0.5">Teléfono</dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={`tel:${digits(orgPhone)}`} className="text-sky-300 hover:text-white inline-flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {orgPhone}
              </a>
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-white text-xs">
                  WhatsApp
                </a>
              )}
            </dd>
          </>
        )}
        {orgEmail && orgEmail !== seller?.email && (
          <>
            <dt className="text-[10px] uppercase tracking-wider text-surface-500 pt-0.5">Empresa</dt>
            <dd>
              <a href={`mailto:${orgEmail}`} className="text-sky-300 hover:text-white break-all">{orgEmail}</a>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
