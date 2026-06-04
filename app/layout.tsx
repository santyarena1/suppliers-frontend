import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mayoristas — Buscador de Productos",
  description: "Buscador de productos mayoristas en múltiples proveedores",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0f1117] text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
