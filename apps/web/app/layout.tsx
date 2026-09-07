import type { Metadata } from "next";
import "./globals.css";
import "./nodo-system.css";
import "./nodo-home.css";
import "./nodo-product.css";
import { archivo, chivoMono } from "./(marketing)/fonts";
import { PrefsProvider } from "@/lib/prefs";
import { CartProvider } from "@/lib/cart";
import { ResultsProvider } from "@/lib/results";
import { ThemeProvider } from "@/lib/theme";
import { BrandingProvider } from "@/lib/branding";
import { brandThemeBootScript } from "@/lib/brand-presets";
import ProviderCartPreloader from "@/components/ProviderCartPreloader";

export const metadata: Metadata = {
  title: "NODO",
  description: "Buscador de productos mayoristas y portal B2B de marcas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`h-full ${archivo.variable} ${chivoMono.variable}`}
      data-theme="soft"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: brandThemeBootScript() }}
        />
      </head>
      <body className="h-full">
        <ThemeProvider>
          <BrandingProvider>
            <PrefsProvider>
              <CartProvider>
                <ProviderCartPreloader />
                <ResultsProvider>
                  {children}
                </ResultsProvider>
              </CartProvider>
            </PrefsProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
