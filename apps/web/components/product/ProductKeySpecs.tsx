import type { PlatformProductContent } from "@/lib/api";

type Spec = PlatformProductContent["specs"][number];

/** Datos que identifican el producto pero no lo describen: no van en la fila de atributos. */
const IDENTITY = /^(fabricante|marca|l[ií]nea|modelo|generaci[oó]n|serie|c[oó]digo|condici[oó]n|a[nñ]o|ean|upc|part|sku|presentaci[oó]n|formato|color)/i;
const MAX_VALUE = 22;
const MAX_ITEMS = 6;

const find = (specs: Spec[], re: RegExp) => specs.find((s) => re.test(s.name));

/**
 * Hasta 6 atributos cortos para ver de un vistazo (debajo de la foto). Junta
 * núcleos/hilos y frecuencia base/turbo cuando están los dos, y suma la garantía.
 */
export function keySpecs(specs: Spec[], warranty: string | null): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const used = new Set<Spec>();
  const take = (label: string, value: string, ...from: (Spec | undefined)[]) => {
    out.push({ label, value });
    from.forEach((s) => s && used.add(s));
  };

  const cores = find(specs, /^n[uú]cleos|cantidad de n[uú]cleos/i);
  const threads = find(specs, /^hilos|cantidad de hilos/i);
  if (cores && threads) take("Núcleos / hilos", `${cores.value} / ${threads.value}`, cores, threads);
  const base = find(specs, /frecuencia base|frecuencia m[ií]nima/i);
  const turbo = find(specs, /frecuencia turbo|frecuencia m[aá]xima|boost/i);
  if (base && turbo) {
    const unit = (v: string) => v.replace(/^[\d.,\s]+/, "").trim();
    const same = unit(base.value) && unit(base.value) === unit(turbo.value);
    take("Frecuencia", same ? `${base.value.replace(unit(base.value), "").trim()} a ${turbo.value}` : `${base.value} a ${turbo.value}`, base, turbo);
  }

  const limit = warranty ? MAX_ITEMS - 1 : MAX_ITEMS;
  for (const s of specs) {
    if (out.length >= limit) break;
    if (used.has(s) || IDENTITY.test(s.name) || s.value.length > MAX_VALUE) continue;
    if (/^(s[ií]|no)$/i.test(s.value)) continue;
    if (out.some((o) => o.label.toLowerCase() === s.name.toLowerCase())) continue;
    take(s.name, s.value, s);
  }
  if (warranty) out.push({ label: "Garantía", value: warranty });
  return out;
}

export default function ProductKeySpecs({ specs, warranty }: { specs: Spec[]; warranty: string | null }) {
  const items = keySpecs(specs, warranty);
  if (items.length < 3) return null;
  return (
    <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-surface-800 bg-surface-900/60 px-3 py-2.5 min-w-0">
          <dt className="text-[11px] font-semibold text-surface-400 truncate">{it.label}</dt>
          <dd className="m-0 mt-0.5 text-[15px] font-bold text-white truncate" title={it.value}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
