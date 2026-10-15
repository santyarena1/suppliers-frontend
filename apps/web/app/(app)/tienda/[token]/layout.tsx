import type { Metadata } from "next";

const TITLE = "Te invitaron a ver una tienda en NODO";
const DESCRIPTION = "Mirá sus productos con stock y precio, y pedile directo. Entrá con tu cuenta de NODO para aceptar la invitación.";

/**
 * Vista previa del link de invitación (WhatsApp): fija, sin datos de la
 * tienda. El token no se resuelve acá: la tienda puede ser privada y quien
 * recibe el link todavía no entró.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "NODO",
    locale: "es_AR",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og/og-tienda.jpg", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og/og-tienda.jpg"] },
};

export default function StoreInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
