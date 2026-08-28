"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import TgsPage from "@/components/tgs/TgsPage";
import TgsEntityForm from "@/components/tgs/TgsEntityForm";
import { tgsApi } from "@/lib/tgs-api";
import { CLIENTE_FIELDS } from "@/lib/tgs-forms";

export default function TgsNuevoClientePage() {
  const router = useRouter();
  return (
    <TgsPage title="Nuevo cliente" subtitle="Todos los campos de AcuStock" wide>
      <Link href="/sistema-tgs/clientes" className="text-xs text-surface-500 hover:text-white w-fit">
        ← Clientes
      </Link>
      <TgsEntityForm
        fields={CLIENTE_FIELDS}
        submitLabel="Crear cliente"
        onSubmit={async (body) => {
          const res = await tgsApi.createCliente(body);
          router.push(res.data?.id != null ? `/sistema-tgs/clientes/${res.data.id}` : "/sistema-tgs/clientes");
        }}
      />
    </TgsPage>
  );
}
