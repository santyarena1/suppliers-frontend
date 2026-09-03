"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import BrandHtmlCanvas from "@/components/org/BrandHtmlCanvas";
import { BrandSpaceLanding, brandHubSlotModules } from "@/components/org/BrandSpaceLanding";
import { getTenant } from "@/lib/auth";
import { brandApi, type BrandHub } from "@/lib/api";
import { Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function BrandHubPage() {
  const params = useParams<{ linkId: string }>();
  const linkId = params?.linkId;
  const tenant = getTenant();
  const retailer = tenant?.type === "RETAILER";
  const [hub, setHub] = useState<BrandHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!linkId) return;
    brandApi
      .hub(linkId)
      .then((res) => setHub(res.data))
      .catch((err) => setAviso(errMsg(err, "No se pudo abrir el espacio de la marca")))
      .finally(() => setLoading(false));
  }, [linkId]);

  const customHtml = Boolean(hub?.htmlDocument);

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${customHtml ? "bg-white" : "bg-surface-950"}`}>
      <header
        className={`flex-shrink-0 border-b px-4 sm:px-6 py-3 flex items-center justify-between ${
          customHtml ? "border-slate-200 bg-white" : "border-surface-800"
        }`}
      >
        <Link
          href="/marcas"
          className={`text-xs ${customHtml ? "text-slate-500 hover:text-slate-900" : "text-surface-400 hover:text-white"}`}
        >
          ← Marcas conectadas
        </Link>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : aviso || !hub ? (
          <p className="text-sm text-red-400 px-6 py-10">{aviso ?? "No encontrado"}</p>
        ) : (
          <HubLanding hub={hub} retailer={retailer} />
        )}
      </div>
    </div>
  );
}

function HubLanding({ hub, retailer }: { hub: BrandHub; retailer: boolean }) {
  const accent = hub.theme.primaryColor || "#22c55e";
  const searchHref = `/search?marca=${encodeURIComponent(hub.name)}`;
  const slots = brandHubSlotModules({ hub, retailer });
  return (
    <BrandSpaceLanding
      variant="hub"
      name={hub.name}
      accent={accent}
      theme={hub.theme}
      contact={hub.contact}
      products={hub.signals}
      actions={hub.actions}
      news={hub.news ?? []}
      materials={hub.materials}
      trainings={hub.trainings}
      presence={hub.presence}
      connectedAt={hub.connectedAt}
      status={hub.status}
      retailer={retailer}
      searchHref={searchHref}
      chatHref={`/mensajes?linkId=${hub.linkId}`}
      noticesHref="/avisos"
      html={
        hub.htmlDocument ? (
          <BrandHtmlCanvas
            html={hub.htmlDocument}
            slots={{
              ...slots,
              logo: hub.theme.logoUrl ? slots.logo : null,
            }}
          />
        ) : null
      }
    />
  );
}
