import { ArrowRight } from "lucide-react";
import { SearchDemo } from "./SearchDemo";

/**
 * Portada: el mensaje arriba y la pantalla de búsqueda real abajo. El campo de
 * partículas está en el fondo de toda la página (PageField).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="nl-shell relative z-10 pb-24 pt-16 lg:pt-24">
        <div className="max-w-3xl">
          <h1 className="nl-h1">
            <span className="nl-accent">+15 distribuidores</span> de tecnología conectados en un solo lugar
          </h1>
          <p className="nl-lead mt-6">
            Buscás una vez y ves quién lo tiene, con stock y precio final con impuestos. Armás un carrito y cada pedido
            llega a su distribuidor.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#probar" className="nl-btn nl-btn--primary">
              Probar 14 días gratis <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a href="#planes" className="nl-btn nl-btn--ghost">
              Ver planes
            </a>
          </div>
        </div>
        <div className="mt-14 lg:mt-16">
          <SearchDemo />
        </div>
      </div>
    </section>
  );
}
