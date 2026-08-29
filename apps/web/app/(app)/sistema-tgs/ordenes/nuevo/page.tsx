"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { tgsApi } from "@/lib/tgs-api";
import { ORDEN_FIELDS } from "@/lib/tgs-forms";

export default function TgsNuevaOrdenPage() {
  const router = useRouter();
  return (
    <TgsPage title="Nueva orden" subtitle="Alta en AcuStock">
      <Link href="/sistema-tgs/ordenes" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Órdenes
      </Link>
      <TgsEntityForm
        fields={ORDEN_FIELDS}
        submitLabel="Crear orden"
        onSubmit={async (body) => {
          const res = await tgsApi.createOrden(body);
          router.push(res.data?.id != null ? `/sistema-tgs/ordenes/${res.data.id}` : "/sistema-tgs/ordenes");
        }}
      />
    </TgsPage>
  );
}
