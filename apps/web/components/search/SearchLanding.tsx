"use client";

import { useEffect, useState } from "react";
import { TrendingDown, Loader2, Clock } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import PromoGrid from "./PromoGrid";
import PartnerCarousel from "./PartnerCarousel";
import { getRecentSearches, SearchEntry, trackSearch } from "@/lib/history";
import { useRouter } from "next/navigation";
import {
  bannersApi, catalogApi, type Banner, type ProductDTO,
} from "@/lib/api";

/**
 * Estado del módulo de búsqueda cuando todavía no hay consulta.
 *
 * Los espacios de publicidad y el carrusel de marcas quedan como están: son
 * superficies con creativos reales y sus tamaños ya están definidos. Lo que
 * cambia es el idioma de las secciones propias, y se suma lo que ayuda a
 * arrancar una búsqueda: las últimas consultas y el consejo del part number.
 */

interface SearchLandingProps {
  onCategoryClick: (category: string) => void;
  onSearchSuggestion?: (q: string) => void;
  /** Pasa las bajas a la grilla de resultados, donde se pueden filtrar. */
  onShowAllDrops?: () => void;
}

export default function SearchLanding({ onCategoryClick: _onCategoryClick, onShowAllDrops }: SearchLandingProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [priceDrops, setPriceDrops] = useState<ProductDTO[]>([]);
  const [recent, setRecent] = useState<SearchEntry[]>([]);

  useEffect(() => {
    setRecent(getRecentSearches(6));
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      bannersApi.list("search"),
      // La portada muestra bastantes de entrada; "Ver todas" lleva al resto.
      catalogApi.priceDrops(60),
    ])
      .then(([bRes, drops]) => {
        if (!alive) return;
        setBanners(Array.isArray(bRes.data) ? bRes.data : []);
        const list = Array.isArray(drops.data) ? drops.data : [];
        // Mayor baja % primero por si el API o cache no vienen ordenados.
        setPriceDrops(
          [...list].sort(
            (a, b) => (b.priceDropPercent ?? 0) - (a.priceDropPercent ?? 0),
          ),
        );
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  function go(q: string) {
    trackSearch(q);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="hm flex flex-col gap-2 pb-8">
      {recent.length > 0 && (
        <div className="hm__sug" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
          <span>
            <Clock className="w-2.5 h-2.5 inline mr-1" />
            Recientes
          </span>
          {recent.map((e) => (
            <button key={e.query} type="button" className="hm__chip" onClick={() => go(e.query)}>
              {e.query}
            </button>
          ))}
        </div>
      )}

      <PromoGrid banners={banners} module="primary" />

      {priceDrops.length > 0 && (
        <section>
          <div className="hm__sec">
            <h3>
              <TrendingDown className="w-3 h-3 inline mr-1.5" />
              Bajaron de precio
            </h3>
            <span className="flex items-center gap-3">
              <span className="text-[0.7rem]" style={{ color: "var(--hm-faint)" }}>
                Descuentos y bajas recientes · varios proveedores
              </span>
              {onShowAllDrops && (
                <button type="button" className="hm__chip" onClick={onShowAllDrops}>
                  Ver todas
                </button>
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 mt-4">
            {priceDrops.map((product, i) => (
              <ProductCard
                key={`${product.provider}-${product.externalId}-${i}`}
                product={product}
              />
            ))}
          </div>
        </section>
      )}

      {/* El segundo modulo y las marcas van DESPUES de las bajas: con los dos
          bentos arriba habia que bajar demasiado para llegar a lo util. */}
      <PartnerCarousel />
      <PromoGrid banners={banners} module="secondary" />

      {priceDrops.length === 0 && (
        <div className="hm__empty">
          <p style={{ color: "var(--hm-fg)", fontWeight: 600, marginBottom: "0.35rem" }}>
            Buscador mayorista NODO
          </p>
          <p style={{ fontSize: "0.75rem" }}>
            Los banners de arriba son espacios de publicidad (propios o patrocinados). Cargá
            creativos en Configuración. Consultá precios desde la barra de búsqueda.
          </p>
        </div>
      )}

      <p
        className="hm-mono mt-2"
        style={{ fontSize: "0.66rem", color: "var(--hm-faint)" }}
      >
        Si tenés el part number, buscá por ahí: es lo único que todos los distribuidores escriben
        igual.
      </p>
    </div>
  );
}
