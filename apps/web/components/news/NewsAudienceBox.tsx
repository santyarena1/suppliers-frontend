"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Globe, Users } from "lucide-react";
import { brandApi } from "@/lib/api";

function audienceLabel(retailers: number, distributors: number) {
  const shops =
    retailers === 0 ? "ningún comercio vinculado todavía" : retailers === 1 ? "tu comercio vinculado" : `tus ${retailers} comercios vinculados`;
  if (distributors === 0) return shops;
  return `${shops} y ${distributors === 1 ? "tu distribuidor vinculado" : `tus ${distributors} distribuidores vinculados`}`;
}

/**
 * Qué pasa al publicar una novedad, dicho sin vueltas: quién la ve siempre,
 * a quién le llega una notificación (opcional) y si tiene link para cualquiera.
 */
export function NewsAudienceBox({
  isBrand,
  notify,
  onNotify,
  isPublic,
  onPublic,
}: {
  isBrand: boolean;
  notify: boolean;
  onNotify: (v: boolean) => void;
  isPublic: boolean;
  onPublic: (v: boolean) => void;
}) {
  const [counts, setCounts] = useState<{ retailers: number; distributors: number } | null>(null);

  useEffect(() => {
    if (!isBrand) return;
    brandApi
      .accounts()
      .then((res) =>
        setCounts({
          retailers: res.data.retailers.filter((r) => r.status !== "REVOKED").length,
          distributors: (res.data.linkedDistributors ?? []).filter((d) => d.status !== "REVOKED").length,
        })
      )
      .catch(() => setCounts(null));
  }, [isBrand]);

  const who = counts
    ? audienceLabel(counts.retailers, counts.distributors)
    : isBrand
      ? "tus comercios y distribuidores vinculados"
      : "tus comercios vinculados";

  return (
    <fieldset className="border border-surface-800 bg-surface-900/40 p-3 flex flex-col gap-3">
      <legend className="px-1 text-[12px] text-surface-300">Quién la ve al publicar</legend>

      <p className="flex items-start gap-2 text-sm text-surface-200">
        <Users className="w-4 h-4 mt-0.5 flex-shrink-0 text-surface-400" />
        <span>
          Siempre aparece en <strong className="text-white">Novedades</strong> de {who}.
          <span className="block text-[11px] text-surface-500 mt-0.5">
            Para llegar a comercios que todavía no trabajan con vos, promocionala en{" "}
            <Link href="/publicidad" className="underline underline-offset-2">
              Publicidad
            </Link>
            .
          </span>
        </span>
      </p>

      <label className="flex items-start gap-2 text-sm text-surface-200 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={notify} onChange={(e) => onNotify(e.target.checked)} />
        <span>
          <span className="inline-flex items-center gap-1.5 text-white">
            <Bell className="w-3.5 h-3.5" /> Mandarles una notificación
          </span>
          <span className="block text-[11px] text-surface-500 mt-0.5">
            A {who} les llega un aviso en <strong>Notificaciones</strong>, dentro de NODO, en el momento en que se
            publica. No se manda mail.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-surface-200 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={isPublic} onChange={(e) => onPublic(e.target.checked)} />
        <span>
          <span className="inline-flex items-center gap-1.5 text-white">
            <Globe className="w-3.5 h-3.5" /> Link público para compartir
          </span>
          <span className="block text-[11px] text-surface-500 mt-0.5">
            Cualquiera la puede abrir con el link, aunque no use NODO. No se muestran listas de precios ni el link de
            reuniones.
          </span>
        </span>
      </label>
    </fieldset>
  );
}
