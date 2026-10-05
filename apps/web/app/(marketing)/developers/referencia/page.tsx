import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "../../landing/nodo-landing.css";
import { Nav } from "@/components/marketing/Nav";
import { ApiReference } from "@/components/developers/ApiReference";

export const metadata: Metadata = {
  title: "Referencia de la API de catálogo | NODO",
  description: "Todos los endpoints de la API de catálogo de NODO, con parámetros, esquemas y ejemplos, generados desde OpenAPI.",
};

export default function ApiReferencePage() {
  return (
    <div className="nl">
      <Nav />
      <div className="nl-shell flex items-center gap-2 py-4 text-sm">
        <Link href="/developers" className="inline-flex items-center gap-1.5 text-[var(--fg-2)] hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver a la guía
        </Link>
      </div>
      <main className="relative z-[1] border-t border-[var(--line)]">
        <ApiReference />
      </main>
    </div>
  );
}
