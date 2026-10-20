"use client";

import { useEffect, useRef, useState } from "react";
import {
  airCheckoutApi,
  elitCheckoutApi,
  grupoNucleoCheckoutApi,
  invidCheckoutApi,
  newBytesCheckoutApi,
  newTreeCheckoutApi,
  solutionBoxCheckoutApi,
  distecnaCheckoutApi,
  polytechCheckoutApi,
} from "@/lib/api";
import type { PolledDraft } from "@/lib/providerOrders";
import { liveJobs, nextJobState, type PendingOrderJob, type PendingOrderProvider } from "@/lib/pendingOrderState";

export type { PendingOrderJob, PendingOrderProvider };

const KEY = "nodo_pending_orders_v1";
const POLL_PENDING_MS = 2_500;
const POLL_APPROVAL_MS = 30_000;
const EVT = "nodo-pending-orders";

type DraftLike = {
  id: string;
  status: string;
  message: string;
  orderNumber?: string | null;
  webOrderNumber?: string | null;
};

function readJobs(): PendingOrderJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOrderJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs: PendingOrderJob[]) {
  localStorage.setItem(KEY, JSON.stringify(liveJobs(jobs).slice(0, 20)));
  window.dispatchEvent(new Event(EVT));
}

export function trackPendingOrder(job: PendingOrderJob) {
  const jobs = readJobs().filter((j) => j.id !== job.id);
  writeJobs([job, ...jobs]);
}

export function patchPendingOrder(id: string, patch: Partial<PendingOrderJob>) {
  writeJobs(readJobs().map((j) => (j.id === id ? { ...j, ...patch } : j)));
}

export function dismissPendingOrder(id: string) {
  writeJobs(readJobs().filter((j) => j.id !== id));
}

export function usePendingOrders(): PendingOrderJob[] {
  const [jobs, setJobs] = useState<PendingOrderJob[]>([]);
  useEffect(() => {
    const sync = () => setJobs(liveJobs(readJobs()));
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    // Para que el "Pedido confirmado" se vaya solo aunque no cambie nada más.
    const expire = window.setInterval(sync, 10_000);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
      window.clearInterval(expire);
    };
  }, []);
  return jobs;
}

async function fetchDraft(provider: PendingOrderProvider, id: string): Promise<PolledDraft> {
  if (provider === "INVID") return (await invidCheckoutApi.draftById(id)).data;
  if (provider === "NEW_BYTES") return (await newBytesCheckoutApi.draftById(id)).data;
  if (provider === "ELIT") return (await elitCheckoutApi.draftById(id)).data;
  if (provider === "NEW_TREE") return (await newTreeCheckoutApi.draftById(id)).data;
  if (provider === "SOLUTION_BOX") return (await solutionBoxCheckoutApi.draftById(id)).data;
  if (provider === "DISTECNA") return (await distecnaCheckoutApi.draftById(id)).data;
  if (provider === "POLYTECH") return (await polytechCheckoutApi.draftById(id)).data;
  if (provider === "GRUPO_NUCLEO") return (await grupoNucleoCheckoutApi.draftById(id)).data;
  return (await airCheckoutApi.draftById(id)).data;
}

/** Consulta los pedidos en ese estado cada `everyMs` y actualiza su aviso. */
function usePollStatus(jobs: PendingOrderJob[], status: PendingOrderJob["status"], everyMs: number) {
  const ids = jobs.filter((j) => j.status === status).map((j) => `${j.provider}:${j.id}`).join(",");
  useEffect(() => {
    if (!ids) return;
    const watched = ids.split(",").map((key) => {
      const [provider, id] = key.split(":");
      return { provider: provider as PendingOrderProvider, id };
    });
    let cancelled = false;
    const tick = async () => {
      for (const { provider, id } of watched) {
        try {
          const row = await fetchDraft(provider, id);
          const job = readJobs().find((j) => j.id === id);
          if (cancelled || !row || !job) continue;
          const patch = nextJobState(job, row);
          if (patch) patchPendingOrder(id, patch);
        } catch {
          // sigue como estaba
        }
      }
    };
    void tick();
    const t = setInterval(tick, everyMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [ids, everyMs]);
}

export function usePendingOrderPolling() {
  const jobs = usePendingOrders();
  usePollStatus(jobs, "PENDING", POLL_PENDING_MS);
  usePollStatus(jobs, "PENDING_APPROVAL", POLL_APPROVAL_MS);
  return jobs;
}

export function useBackgroundCheckout<T extends DraftLike>(
  provider: PendingOrderProvider,
  failMessage: string
) {
  const [background, setBackground] = useState(true);
  const [result, setResult] = useState<T | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const leftInBackground = useRef(false);
  const jobs = usePendingOrders();

  useEffect(() => {
    if (!result?.id || result.status !== "PENDING") return;
    const job = jobs.find((j) => j.id === result.id);
    if (!job || job.status === "PENDING") return;
    if (job.status === "CREATED") {
      setResult((prev) => prev ? {
        ...prev,
        status: "CREATED",
        orderNumber: job.orderNumber ?? prev.orderNumber,
        webOrderNumber: job.webOrderNumber ?? prev.webOrderNumber,
        message: job.message,
      } : prev);
    } else {
      setJobError(job.errorMessage || failMessage);
      setResult(null);
    }
  }, [jobs, result?.id, result?.status, failMessage]);

  function openConfirm() {
    setJobError(null);
    setResult(null);
    leftInBackground.current = false;
    setConfirmOpen(true);
  }

  function acceptResult(data: T) {
    trackPendingOrder({
      id: data.id,
      provider,
      status:
        data.status === "CREATED" ? "CREATED"
          : data.status === "FAILED" ? "FAILED"
            : data.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL"
              : "PENDING",
      message: data.message,
      webOrderNumber: data.webOrderNumber,
      orderNumber: data.orderNumber,
      startedAt: Date.now(),
    });
    setResult(data);
    if (background || leftInBackground.current) setConfirmOpen(false);
  }

  function leaveInBackground() {
    leftInBackground.current = true;
    setConfirmOpen(false);
  }

  function finishOrder(onCreated: (message?: string) => void) {
    setConfirmOpen(false);
    // Un pedido a la espera de aprobación ya salió del carrito: se vacía igual que
    // uno confirmado, y el seguimiento pasa a la pantalla de pedidos.
    if (result?.status === "CREATED" || result?.status === "PENDING_APPROVAL") onCreated(result.message);
  }

  return {
    background,
    setBackground,
    result,
    confirmOpen,
    jobError,
    openConfirm,
    acceptResult,
    leaveInBackground,
    finishOrder,
    setConfirmOpen,
  };
}
