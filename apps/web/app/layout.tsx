import type { Metadata } from "next";
import "./globals.css";
import "./nodo-system.css";
import "./nodo-home.css";
import "./nodo-product.css";
import { inter, jetbrainsMono } from "./fonts-app";
import { PrefsProvider } from "@/lib/prefs";
import { CartProvider } from "@/lib/cart";
import { ResultsProvider } from "@/lib/results";
import { ThemeProvider } from "@/lib/theme";
import { BrandingProvider } from "@/lib/branding";
import { brandThemeBootScript } from "@/lib/brand-presets";
import ProviderCartPreloader from "@/components/ProviderCartPreloader";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nodohub.app";
const SHARE_TITLE = "NODO | Todos tus distribuidores en una sola búsqueda";
const SHARE_DESCRIPTION =
  "Stock y precio final con impuestos de +15 distribuidores de tecnología, al instante. Comparás, armás un carrito y pedís.";

/**
 * Lo que se ve al compartir un link de NODO (WhatsApp, redes): título, texto e
 * imagen 1200×630 (public/og). Las páginas que tienen su propia imagen
 * (distribuidores, marcas, invitación a una tienda) la pisan.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "NODO",
  description: "Buscador de productos mayoristas y portal B2B de marcas",
  applicationName: "NODO",
  openGraph: {
    type: "website",
    siteName: "NODO",
    locale: "es_AR",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [{ url: "/og/og-nodo.jpg", width: 1200, height: 630, alt: "NODO: todos tus distribuidores en una sola búsqueda" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: ["/og/og-nodo.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`h-dvh ${inter.variable} ${jetbrainsMono.variable}`}
      data-theme="soft"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: brandThemeBootScript() }}
        />
      </head>
      <body className="h-dvh">
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
