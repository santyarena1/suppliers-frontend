import type { Metadata } from "next";
import "../nodo-landing.css";
import { SupplyDetail } from "@/components/marketing/SupplyDetail";
import { PortfolioPreview } from "@/components/marketing/SupplyPreviews";
import { SUPPLY } from "@/lib/marketing-supply";

export const metadata: Metadata = {
  title: "NODO para distribuidores",
  description: SUPPLY.distribuidores.lead,
};

export default function DistribuidoresPage() {
  return <SupplyDetail audience={SUPPLY.distribuidores} preview={<PortfolioPreview />} />;
}
