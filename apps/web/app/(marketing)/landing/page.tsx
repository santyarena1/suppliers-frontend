import "./nodo-landing.css";
import { BeforeAfter } from "@/components/marketing/BeforeAfter";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { Communications } from "@/components/marketing/Communications";
import { Contact } from "@/components/marketing/Contact";
import { CostDemo } from "@/components/marketing/CostDemo";
import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { MarginDemo } from "@/components/marketing/MarginDemo";
import { Nav } from "@/components/marketing/Nav";
import { PageField } from "@/components/marketing/PageField";
import { Pricing } from "@/components/marketing/Pricing";
import { Savings } from "@/components/marketing/Savings";
import { Signup } from "@/components/marketing/Signup";
import { StackedSections } from "@/components/marketing/StackedSections";
import { StatsDemo } from "@/components/marketing/StatsDemo";
import { Steps } from "@/components/marketing/Steps";

/**
 * Landing de NODO: qué resuelve (comparar y comprar a todos los distribuidores
 * en un lugar), cuánto ahorra (calculadora con los números del visitante),
 * cómo se ve (demos del producto) y cuánto cuesta (Pro destacado).
 */
export default function LandingPage() {
  return (
    <div className="nl">
      <PageField />
      <Nav />
      <main className="relative z-[1]">
        {/* Cada sección es una hoja que sube y tapa a la anterior. */}
        <StackedSections>
        <Hero />
        <BeforeAfter />
        <CostDemo />
        <MarginDemo />
        <CheckoutDemo />
        <Communications />
        <Savings />
        <Steps />
        <Pricing />
        <StatsDemo />
        <Faq />
        <Signup />
        <Contact />
        </StackedSections>
      </main>
      <div className="relative z-[1]">
        <Footer />
      </div>
      <div className="lnd-grain" aria-hidden />
    </div>
  );
}
