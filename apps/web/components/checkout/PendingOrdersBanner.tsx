"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, X, XCircle } from "lucide-react";
import { PROVIDER_LABELS } from "@/lib/api";
import {
  dismissPendingOrder,
  patchPendingOrder,
  type PendingOrderJob,
  type PendingOrderProvider,
  usePendingOrderPolling,
} from "@/lib/pendingOrders";
import { providerOrdersHref } from "@/lib/providerOrders";

export default function PendingOrdersBanner({
  onCreated,
}: {
  onCreated: (provider: PendingOrderProvider, message: string) => void;
}) {
  const jobs = usePendingOrderPolling();
  const seenCreated = useRef(new Set<string>());

  useEffect(() => {
    for (const job of jobs) {
      if (job.status !== "CREATED" || job.notified || seenCreated.current.has(job.id)) continue;
      seenCreated.current.add(job.id);
      patchPendingOrder(job.id, { notified: true });
      onCreated(job.provider, job.message);
    }
  }, [jobs, onCreated]);

  if (jobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  );
}

function JobRow({ job }: { job: PendingOrderJob }) {
  const label = PROVIDER_LABELS[job.provider] ?? job.provider;
  const pending = job.status === "PENDING";
  const esperandoFirma = job.status === "PENDING_APPROVAL";
  const ok = job.status === "CREATED";
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 border text-sm ${
      pending ? "border-sky-500/30 bg-sky-500/5 text-sky-200"
        : esperandoFirma ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
        : ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
        : "border-red-500/30 bg-red-500/5 text-red-300"
    }`}>
      {pending ? <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin" />
        : esperandoFirma ? <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
        : ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
        : <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-[12px] opacity-80 leading-snug mt-0.5">{job.message}</p>
        {(job.webOrderNumber || job.orderNumber) && (
          <p className="text-[11px] font-mono opacity-70 mt-0.5">
            {job.webOrderNumber ? `Pedido web ${job.webOrderNumber}` : `Orden ${job.orderNumber}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={esperandoFirma ? "/pedidos" : providerOrdersHref(job.provider)}
          className="text-[11px] underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          {esperandoFirma ? "Ver pedido" : "Historial"}
        </Link>
        <button type="button" onClick={() => dismissPendingOrder(job.id)} className="p-1 opacity-60 hover:opacity-100" aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
