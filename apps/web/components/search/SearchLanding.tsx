"use client";

import { useEffect, useState } from "react";
import { TrendingDown, Loader2 } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import PromoGrid from "./PromoGrid";
import PartnerCarousel from "./PartnerCarousel";
import CategoryStrip from "./CategoryStrip";
import {
  bannersApi, catalogApi, type Banner, type CategoryCount, type ProductDTO,
} from "@/lib/api";

interface SearchLandingProps {
  onCategoryClick: (category: string) => void;
  onSearchSuggestion?: (q: string) => void;
}

export default function SearchLanding({ onCategoryClick }: SearchLandingProps) {
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [priceDrops, setPriceDrops] = useState<ProductDTO[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      bannersApi.list("search"),
      catalogApi.categories(),
      catalogApi.priceDrops(24),
    ])
      .then(([bRes, cats, drops]) => {
        if (!alive) return;
        setBanners(Array.isArray(bRes.data) ? bRes.data : []);
        setCategories(Array.isArray(cats.data) ? cats.data : []);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-8">
      <PromoGrid banners={banners} />
      <PartnerCarousel />
      <CategoryStrip categories={categories} onSelect={onCategoryClick} />

      {priceDrops.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <TrendingDown className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Bajaron de precio</h2>
            <span className="text-xs text-surface-500">
              Descuentos y bajas recientes · varios proveedores
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {priceDrops.map((product, i) => (
              <ProductCard
                key={`${product.provider}-${product.externalId}-${i}`}
                product={product}
              />
            ))}
          </div>
        </section>
      )}

      {categories.length === 0 && priceDrops.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center rounded-2xl border border-dashed border-surface-700 bg-surface-900/30 px-6">
          <p className="text-sm font-medium text-surface-300">Buscador mayorista NODO</p>
          <p className="text-xs text-surface-500 max-w-md">
            Los banners de arriba son de demo hasta que cargues los tuyos en Configuración. Consultá precios desde la barra de búsqueda.
          </p>
        </div>
      )}
    </div>
  );
}
