import type { Metadata } from "next";
import "./globals.css";
import { PrefsProvider } from "@/lib/prefs";
import { CartProvider } from "@/lib/cart";
import { ResultsProvider } from "@/lib/results";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "TGS Suppliers",
  description: "Buscador de productos mayoristas",
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
              </ResultsProvider>
            </CartProvider>
          </PrefsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
