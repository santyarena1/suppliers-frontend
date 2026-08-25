import type { Banner } from "@/lib/api";
import type { BannerSlot } from "@/lib/brand-presets";

/**
 * Banners de demostración para el bento del buscador.
 * Se usan solo en slots sin banner real cargado por el admin.
 * Imágenes de Unsplash (tech / retail) con tamaño acorde a cada slot.
 */
const DEMO: Record<
  BannerSlot,
  { imageUrl: string; title: string; subtitle: string }
> = {
  hero_main: {
    imageUrl:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&h=900&q=80",
    title: "Hardware al mejor costo",
    subtitle: "Demo · reemplazá desde Configuración → Banners",
  },
  hero_side: {
    imageUrl:
      "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=1000&h=900&q=80",
    title: "Placas y notebooks",
    subtitle: "Demo · slot hero lateral",
  },
  tile_1: {
    imageUrl:
      "https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=700&h=520&q=80",
    title: "Periféricos",
    subtitle: "Demo",
  },
  tile_2: {
    imageUrl:
      "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=680&h=500&q=80",
    title: "Monitores",
    subtitle: "Demo",
  },
  tile_3: {
    imageUrl:
      "https://images.unsplash.com/photo-1547082299-de196ea013d0?auto=format&fit=crop&w=640&h=720&q=80",
    title: "Almacenamiento",
    subtitle: "Demo",
  },
  tile_4: {
    imageUrl:
      "https://images.unsplash.com/photo-1555617981-dac3880eac6e?auto=format&fit=crop&w=480&h=960&q=80",
    title: "Gaming",
    subtitle: "Demo",
  },
  strip: {
    imageUrl:
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1920&h=280&q=80",
    title: "Promos de la semana",
    subtitle: "Demo · banda full width — cargá la tuya en admin",
  },
};

export function demoBannerForSlot(slot: BannerSlot): Banner {
  const d = DEMO[slot];
  return {
    id: `demo-${slot}`,
    position: "search",
    slot,
    imageUrl: d.imageUrl,
    title: d.title,
    subtitle: d.subtitle,
    linkUrl: null,
    order: 0,
    active: true,
  };
}
