import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider } from "@/lib/prefs";
import { CartProvider } from "@/lib/cart";
import { ResultsProvider } from "@/lib/results";
import { ThemeProvider } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "NODO",
  description: "Buscador de productos mayoristas y portal B2B de marcas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full" data-theme="dark" suppressHydrationWarning>
      <body className="h-full">
        <ThemeProvider>
          <PrefsProvider>
            <CartProvider>
              <ResultsProvider>
                {children}
                <ThemeToggle />
              </ResultsProvider>
            </CartProvider>
          </PrefsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
