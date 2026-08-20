import NodoLogo from "./NodoLogo";

/** Loader animado con el ícono real de NODO en vez de un spinner genérico. */
export default function NodoSpinner({ className = "w-5 h-5" }: { className?: string }) {
  return <NodoLogo className={`${className} animate-spin`} />;
}
