"use client";

import TgsPage from "@/components/tgs/TgsPage";
import TgsKeysForm from "@/components/tgs/TgsKeysForm";

export default function TgsClavesPage() {
  return (
    <TgsPage title="Claves" subtitle="Integración HTTP con AcuStock Sistema">
      <TgsKeysForm />
    </TgsPage>
  );
}
