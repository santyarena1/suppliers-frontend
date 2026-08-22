"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
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
  const [featured, setFeatured] = useState<ProductDTO[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      bannersApi.list("search"),
      catalogApi.categories(),
      catalogApi.featured(24),
    ])
      .then(([bRes, cats, feat]) => {
        if (!alive) return;
        setBanners(Array.isArray(bRes.data) ? bRes.data : []);
        setCategories(Array.isArray(cats.data) ? cats.data : []);
        setFeatured(Array.isArray(feat.data) ? feat.data : []);
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

      {featured.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-brand-600" />
            <h2 className="text-base font-bold text-white">Destacados del catálogo</h2>
            <span className="text-xs text-surface-500">Precios de proveedores sincronizados</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {featured.map((product, i) => (
              <ProductCard
                key={`${product.provider}-${product.externalId}-${i}`}
                product={product}
                variant="storefront"
              />
            ))}
          </div>
        </section>
      )}

      {categories.length === 0 && featured.length === 0 && banners.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center rounded-2xl border border-dashed border-surface-700 bg-surface-900/30 px-6">
          <p className="text-sm font-medium text-surface-300">Buscador mayorista NODO</p>
          <p className="text-xs text-surface-500 max-w-md">
            Consultá precios en todos tus proveedores desde la barra de búsqueda. El admin puede cargar promociones en el grid superior.
          </p>
        </div>
      )}
    </div>
  );
}
