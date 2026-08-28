"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { tgsApi } from "@/lib/tgs-api";
import { RMA_CREATE_FIELDS } from "@/lib/tgs-forms";

export default function TgsNuevoRmaPage() {
  return (
    <Suspense fallback={<TgsPage title="Nuevo RMA"><p className="text-sm text-surface-500">Cargando…</p></TgsPage>}>
      <TgsNuevoRmaInner />
    </Suspense>
  );
}

function TgsNuevoRmaInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initial: Record<string, unknown> = {};
  for (const key of ["cliente_id", "venta_id", "orden_trabajo_id", "venta_numero"]) {
    const value = search.get(key);
    if (value) initial[key] = value;
  }

  return (
    <TgsPage title="Nuevo RMA" subtitle="Todos los campos de AcuStock" wide>
      <Link href="/sistema-tgs/rma" className="text-xs text-surface-500 hover:text-white w-fit">
        ← RMA
      </Link>
      <TgsEntityForm
        fields={RMA_CREATE_FIELDS}
        initial={initial}
        submitLabel="Crear caso"
        onSubmit={async (body) => {
          const res = await tgsApi.createRma(body);
          const id = res.data?.id;
          router.push(id != null ? `/sistema-tgs/rma/${id}` : "/sistema-tgs/rma");
        }}
      />
    </TgsPage>
  );
}
