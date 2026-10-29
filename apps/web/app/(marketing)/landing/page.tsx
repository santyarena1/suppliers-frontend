import "./nodo-landing.css";
import { DemoVideo } from "@/components/marketing/DemoVideo";
import { BuilderSection } from "@/components/marketing/BuilderSection";
import { Everything } from "@/components/marketing/Everything";
import { PriceSection } from "@/components/marketing/PriceSection";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { Contact } from "@/components/marketing/Contact";
import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { Nav } from "@/components/marketing/Nav";
import { PageField } from "@/components/marketing/PageField";
import { Pricing } from "@/components/marketing/Pricing";
import { Signup } from "@/components/marketing/Signup";
import { StackedSections } from "@/components/marketing/StackedSections";

/**
 * Landing de NODO: qué resuelve (comparar y comprar a todos los distribuidores
 * en un lugar), cómo se ve (video y demos del producto), el armador de PC con
 * presupuestos, todas las demás funciones y cuánto cuesta (Pro destacado).
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
        <PriceSection />
        <CheckoutDemo />
        <BuilderSection />
        <Everything />
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
