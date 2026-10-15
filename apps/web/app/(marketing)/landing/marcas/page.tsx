import type { Metadata } from "next";
import "../nodo-landing.css";
import { SupplyDetail } from "@/components/marketing/SupplyDetail";
import { StockLightPreview } from "@/components/marketing/SupplyPreviews";
import { SUPPLY } from "@/lib/marketing-supply";

export const metadata: Metadata = {
  title: "NODO para marcas",
  description: SUPPLY.marcas.lead,
  openGraph: {
    type: "website",
    siteName: "NODO",
    locale: "es_AR",
    url: "/marcas",
    title: "NODO para marcas",
    description: SUPPLY.marcas.lead,
    images: [{ url: "/og/og-marcas.jpg", width: 1200, height: 630, alt: "NODO para marcas: dónde está tu producto y a cuánto se vende" }],
  },
  twitter: { card: "summary_large_image", title: "NODO para marcas", description: SUPPLY.marcas.lead, images: ["/og/og-marcas.jpg"] },
};

export default function MarcasPage() {
  return <SupplyDetail audience={SUPPLY.marcas} preview={<StockLightPreview />} />;
}
