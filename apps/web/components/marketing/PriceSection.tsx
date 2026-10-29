import { CostDemo } from "./CostDemo";
import { MarginDemo } from "./MarginDemo";
import { Reveal } from "./Reveal";

/**
 * El precio de un producto, de punta a punta: lo que te sale de verdad (lista,
 * IVA, percepciones y envío) y cuánto ganás contra lo que se vende afuera.
 * Antes eran dos secciones seguidas sobre el mismo producto.
 */
export function PriceSection() {
  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">El precio final y cuánto ganás, antes de comprar</h2>
          <p className="nl-lead mt-5 max-w-3xl">
            Cada producto trae el precio de lista, el IVA, las percepciones que te aplica ese distribuidor y el envío
            aproximado. Al lado, a cuánto lo venden los locales de computación y a cuánto lo tenés publicado vos, con tu
            margen calculado sobre el costo final. Sin sumar a mano.
          </p>
        </Reveal>
        <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
          <div>
            <h3 className="nl-h3 mb-4">Lo que te sale de verdad</h3>
            <CostDemo embedded />
          </div>
          <div>
            <h3 className="nl-h3 mb-4">Cuánto ganás</h3>
            <MarginDemo embedded />
          </div>
        </div>
      </div>
    </section>
  );
}
