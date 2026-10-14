import "./nodo-landing.css";
import { DemoVideo } from "@/components/marketing/DemoVideo";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { Communications } from "@/components/marketing/Communications";
import { Contact } from "@/components/marketing/Contact";
import { CostDemo } from "@/components/marketing/CostDemo";
import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { MarginDemo } from "@/components/marketing/MarginDemo";
import { SellerModeDemo } from "@/components/marketing/SellerModeDemo";
import { Nav } from "@/components/marketing/Nav";
import { PageField } from "@/components/marketing/PageField";
import { Pricing } from "@/components/marketing/Pricing";
import { Savings } from "@/components/marketing/Savings";
import { Signup } from "@/components/marketing/Signup";
import { StackedSections } from "@/components/marketing/StackedSections";
import { Steps } from "@/components/marketing/Steps";

/**
 * Landing de NODO: qué resuelve (comparar y comprar a todos los distribuidores
 * en un lugar), cuánto ahorra (calculadora con los números del visitante),
 * cómo se ve (video y demos del producto) y cuánto cuesta (Pro destacado).
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
        <DemoVideo />
        <CostDemo />
        <MarginDemo />
        <CheckoutDemo />
        <SellerModeDemo />
        <Communications />
        <Savings />
        <Steps />
        <Pricing />
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
