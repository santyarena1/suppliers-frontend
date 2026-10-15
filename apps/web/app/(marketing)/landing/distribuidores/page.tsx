import type { Metadata } from "next";
import "../nodo-landing.css";
import { SupplyDetail } from "@/components/marketing/SupplyDetail";
import { PortfolioPreview } from "@/components/marketing/SupplyPreviews";
import { SUPPLY } from "@/lib/marketing-supply";

export const metadata: Metadata = {
  title: "NODO para distribuidores",
  description: SUPPLY.distribuidores.lead,
  openGraph: {
    type: "website",
    siteName: "NODO",
    locale: "es_AR",
    url: "/distribuidores",
    title: "NODO para distribuidores",
    description: SUPPLY.distribuidores.lead,
    images: [{ url: "/og/og-distribuidores.jpg", width: 1200, height: 630, alt: "NODO para distribuidores: los comercios te encuentran y te piden" }],
  },
  twitter: { card: "summary_large_image", title: "NODO para distribuidores", description: SUPPLY.distribuidores.lead, images: ["/og/og-distribuidores.jpg"] },
};

export default function DistribuidoresPage() {
  return <SupplyDetail audience={SUPPLY.distribuidores} preview={<PortfolioPreview />} />;
}
