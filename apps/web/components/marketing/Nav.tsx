import Link from "next/link";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";

const LINKS = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#ahorro", label: "Cuánto ahorrás" },
  { href: "#planes", label: "Planes" },
  { href: "#preguntas", label: "Preguntas" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgb(10_11_18/0.78)] backdrop-blur-md">
      <div className="nl-shell flex h-16 items-center justify-between gap-6">
        <Link href="/landing" className="flex items-center gap-2.5" aria-label="NODO, inicio">
          <NodoLogo className="h-7 w-7" />
          <NodoWordmark className="h-3.5" />
        </Link>
        <nav aria-label="Secciones" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm text-[var(--fg-2)] transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm text-[var(--fg-2)] hover:text-white sm:inline-flex">
            Entrar
          </Link>
          <a href="#probar" className="nl-btn nl-btn--primary nl-btn--sm">
            Probar NODO
          </a>
        </div>
      </div>
    </header>
  );
}
