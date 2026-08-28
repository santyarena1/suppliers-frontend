"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { tgsApi } from "@/lib/tgs-api";
import { STOCK_CREATE_FIELDS } from "@/lib/tgs-forms";

export default function TgsNuevoStockPage() {
  const router = useRouter();
  return (
    <TgsPage title="Nuevo producto" subtitle="Todos los campos de AcuStock" wide>
      <Link href="/sistema-tgs/stock" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Stock
      </Link>
      <TgsEntityForm
        fields={STOCK_CREATE_FIELDS}
        submitLabel="Crear producto"
        onSubmit={async (body) => {
          const res = await tgsApi.createStock(body);
          const id = res.data?.sku || res.data?.id;
          router.push(id != null ? `/sistema-tgs/stock/${encodeURIComponent(String(id))}` : "/sistema-tgs/stock");
        }}
      />
    </TgsPage>
  );
}
