import "./nodo-landing.css";
import { BeforeAfter } from "@/components/marketing/BeforeAfter";
import { CheckoutDemo } from "@/components/marketing/CheckoutDemo";
import { Communications } from "@/components/marketing/Communications";
import { CostDemo } from "@/components/marketing/CostDemo";
import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";
import { Hero } from "@/components/marketing/Hero";
import { Nav } from "@/components/marketing/Nav";
import { Pricing } from "@/components/marketing/Pricing";
import { Savings } from "@/components/marketing/Savings";
import { Signup } from "@/components/marketing/Signup";
import { Steps } from "@/components/marketing/Steps";

/**
 * Landing de NODO: qué resuelve (comparar y comprar a todos los distribuidores
 * en un lugar), cuánto ahorra (calculadora con los números del visitante),
 * cómo se ve (demos del producto) y cuánto cuesta (Pro destacado).
 */
export default function LandingPage() {
  return (
    <div className="nl">
      <Nav />
      <main>
        <Hero />
        <BeforeAfter />
        <CostDemo />
        <CheckoutDemo />
        <Communications />
        <Savings />
        <Steps />
        <Pricing />
        <Faq />
        <Signup />
      </main>
      <Footer />
      <div className="lnd-grain" aria-hidden />
    </div>
  );
}
