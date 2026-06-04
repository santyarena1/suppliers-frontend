import { ProductDTO } from "@/lib/api";
import { Package } from "lucide-react";
import Image from "next/image";

const PROVIDER_COLORS: Record<string, string> = {
  NEW_BYTES: "bg-blue-500/20 text-blue-300",
  ELIT: "bg-purple-500/20 text-purple-300",
  GRUPO_NUCLEO: "bg-green-500/20 text-green-300",
  AIR: "bg-cyan-500/20 text-cyan-300",
  NEW_TREE: "bg-teal-500/20 text-teal-300",
  INVID: "bg-orange-500/20 text-orange-300",
  GC: "bg-red-500/20 text-red-300",
  POLYTECH: "bg-pink-500/20 text-pink-300",
  ASHIR: "bg-indigo-500/20 text-indigo-300",
  HDC: "bg-yellow-500/20 text-yellow-300",
  SOLUTION_BOX: "bg-emerald-500/20 text-emerald-300",
  DISTECNA: "bg-violet-500/20 text-violet-300",
  CEVEN: "bg-rose-500/20 text-rose-300",
  DIAPSTORE: "bg-sky-500/20 text-sky-300",
};

export default function ProductCard({ product }: { product: ProductDTO }) {
  const providerColor = PROVIDER_COLORS[product.provider] || "bg-gray-500/20 text-gray-300";

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-500 transition-colors flex flex-col">
      <div className="bg-gray-900 h-44 flex items-center justify-center relative">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-3"
            unoptimized
          />
        ) : (
          <Package className="w-14 h-14 text-gray-600" />
        )}
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded self-start ${providerColor}`}>
          {product.provider}
        </span>
        <p className="text-sm text-gray-200 font-medium leading-tight line-clamp-3 flex-1">
          {product.name}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xl font-bold text-white">
            {product.price ? `$${product.price}` : "—"}
          </span>
          {product.externalId && (
            <span className="text-xs text-gray-500">#{product.externalId}</span>
          )}
        </div>
      </div>
    </div>
  );
}
