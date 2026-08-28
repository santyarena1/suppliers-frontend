"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { tgsApi } from "@/lib/tgs-api";
import { VENTA_FIELDS } from "@/lib/tgs-forms";

export default function TgsNuevaVentaPage() {
  const router = useRouter();
  return (
    <TgsPage title="Nueva venta" subtitle="Todos los campos de AcuStock" wide>
      <Link href="/sistema-tgs/ventas" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Ventas
      </Link>
      <p className="text-[11px] text-surface-500">
        Mismos campos que el alta en el sistema: encabezado, ítems (cantidad, precio, IVA, S/N, origen, entrega) y
        totales.{" "}
        <Link href="/sistema-tgs/clientes/nuevo" className="text-brand-400 hover:text-brand-300">
          + Nuevo cliente
        </Link>
      </p>
      <TgsEntityForm
        fields={VENTA_FIELDS}
        withLines
        submitLabel="Crear venta"
        onSubmit={async (body) => {
          const res = await tgsApi.createVenta(body);
          router.push(res.data?.id != null ? `/sistema-tgs/ventas/${res.data.id}` : "/sistema-tgs/ventas");
        }}
      />
    </TgsPage>
  );
}
