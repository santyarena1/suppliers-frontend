"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { tgsApi } from "@/lib/tgs-api";
import { COMPRA_FIELDS } from "@/lib/tgs-forms";

export default function TgsNuevaCompraPage() {
  const router = useRouter();
  return (
    <TgsPage title="Nueva compra" subtitle="Todos los campos de AcuStock" wide>
      <Link href="/sistema-tgs/compras" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Compras
      </Link>
      <TgsEntityForm
        fields={COMPRA_FIELDS}
        withLines
        submitLabel="Crear compra"
        onSubmit={async (body) => {
          const res = await tgsApi.createCompra(body);
          router.push(res.data?.id != null ? `/sistema-tgs/compras/${res.data.id}` : "/sistema-tgs/compras");
        }}
      />
    </TgsPage>
  );
}
