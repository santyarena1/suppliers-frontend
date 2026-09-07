import Audiences from "@/components/landing/Audiences";
import BuyScene from "@/components/landing/BuyScene";
import CostScene from "@/components/landing/CostScene";
import Hero from "@/components/landing/Hero";
import HowToStart from "@/components/landing/HowToStart";
import LandingFooter from "@/components/landing/LandingFooter";
import { LandingNav, SectionRail } from "@/components/landing/LandingNav";
import Pricing from "@/components/landing/Pricing";
import SearchScene from "@/components/landing/SearchScene";
import SignupCta from "@/components/landing/SignupCta";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <SectionRail />

      <main>
        <Hero />
        <SearchScene />
        <CostScene />
        <BuyScene />
        <HowToStart />
        <Audiences />
        <Pricing />
        <SignupCta />
      </main>

      <LandingFooter />
      <div className="lnd-grain" />
    </>
  );
}
