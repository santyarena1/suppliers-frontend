import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider } from "@/lib/prefs";
import { CartProvider } from "@/lib/cart";
import { ResultsProvider } from "@/lib/results";
import { ThemeProvider } from "@/lib/theme";
import { BrandingProvider } from "@/lib/branding";
import ThemeToggle from "@/components/ThemeToggle";
import ProviderCartPreloader from "@/components/ProviderCartPreloader";

export const metadata: Metadata = {
  title: "NODO",
  description: "Buscador de productos mayoristas y portal B2B de marcas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full" data-theme="dark" suppressHydrationWarning>
      <body className="h-full">
        <ThemeProvider>
          <BrandingProvider>
            <PrefsProvider>
            <CartProvider>
              <ProviderCartPreloader />
              <ResultsProvider>
                {children}
                <ThemeToggle />
              </ResultsProvider>
            </CartProvider>
            </PrefsProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
