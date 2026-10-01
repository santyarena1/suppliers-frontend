import type { Metadata } from "next";
import "../nodo-landing.css";
import { SupplyDetail } from "@/components/marketing/SupplyDetail";
import { StockLightPreview } from "@/components/marketing/SupplyPreviews";
import { SUPPLY } from "@/lib/marketing-supply";

export const metadata: Metadata = {
  title: "NODO para marcas",
  description: SUPPLY.marcas.lead,
};

export default function MarcasPage() {
  return <SupplyDetail audience={SUPPLY.marcas} preview={<StockLightPreview />} />;
}
