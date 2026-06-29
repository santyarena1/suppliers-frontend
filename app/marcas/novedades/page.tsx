"use client";

import { useEffect, useState } from "react";
import BrandModuleShell from "@/components/brands/BrandModuleShell";
import Toast from "@/components/brands/Toast";
import { useToast } from "@/components/brands/useToast";
import RoleGuard from "@/components/RoleGuard";
import { USER_BRANDS_NAV } from "@/lib/brands/nav";
import { userBrandsApi, type BrandNews } from "@/lib/brands";
import { NEWS_TYPE_LABELS, type NewsType } from "@/lib/brands/constants";
import { Loader2 } from "lucide-react";

export default function NovedadesUsuarioPage() {
  const { toast, showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<BrandNews[]>([]);
  const [typeFilter, setTypeFilter] = useState<NewsType | "">("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await userBrandsApi.news({ type: typeFilter || undefined });
        setNews(res.items);
      } catch {
        showToast("Error al cargar novedades", false);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [typeFilter, showToast]);

  return (
    <RoleGuard allowed={["ROLE_USER", "ROLE_ADMIN"]}>
      <BrandModuleShell title="Novedades" subtitle="Feed de tus marcas autorizadas" nav={USER_BRANDS_NAV}>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as NewsType | "")}
          className="mb-5 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-surface-200"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(NEWS_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
        ) : news.length === 0 ? (
          <p className="text-center py-20 text-surface-400 text-sm">No hay novedades publicadas.</p>
        ) : (
          <div className="space-y-3">
            {news.map((n) => (
              <article key={n.id} className="bg-surface-800 border border-surface-700 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-brand-600/15 text-brand-400">
                    {NEWS_TYPE_LABELS[n.type]}
                  </span>
                  {n.publishedAt && (
                    <span className="text-[10px] text-surface-500">
                      {new Date(n.publishedAt).toLocaleDateString("es-AR")}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-white">{n.title}</h3>
                <p className="text-sm text-surface-400 mt-2 leading-relaxed">{n.description}</p>
              </article>
            ))}
          </div>
        )}
        <Toast toast={toast} />
      </BrandModuleShell>
    </RoleGuard>
  );
}
