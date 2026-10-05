import Link from "next/link";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";

export function Footer() {
  return (
    <footer className="border-t border-[var(--line)] py-12">
      <div className="nl-shell flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <NodoLogo className="h-6 w-6" />
          <NodoWordmark className="h-3" />
          <span className="ml-3 text-sm text-[var(--fg-3)]">Compras de tecnología para comercios.</span>
        </div>
        <nav aria-label="Pie" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--fg-2)]">
          <Link href="/#como-funciona" className="hover:text-white">Cómo funciona</Link>
          <Link href="/#planes" className="hover:text-white">Planes</Link>
          <Link href="/#preguntas" className="hover:text-white">Preguntas</Link>
          <Link href="/developers" className="hover:text-white">API para desarrolladores</Link>
          <Link href="/login" className="hover:text-white">Entrar</Link>
        </nav>
      </div>
    </footer>
  );
}
