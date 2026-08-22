"use client";

import { useEffect, useRef, useState } from "react";
import {
  airCheckoutApi,
  elitCheckoutApi,
  grupoNucleoCheckoutApi,
  invidCheckoutApi,
  newBytesCheckoutApi,
} from "@/lib/api";
import type { PolledDraft } from "@/lib/providerOrders";

const KEY = "nodo_pending_orders_v1";
const EVT = "nodo-pending-orders";

export type PendingOrderProvider = "INVID" | "NEW_BYTES" | "ELIT" | "GRUPO_NUCLEO" | "AIR";

export type PendingOrderJob = {
  id: string;
  provider: PendingOrderProvider;
  status: "PENDING" | "CREATED" | "FAILED";
  message: string;
  webOrderNumber?: string | null;
  orderNumber?: string | null;
  errorMessage?: string | null;
  startedAt: number;
  notified?: boolean;
};

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
  localStorage.setItem(KEY, JSON.stringify(jobs.slice(0, 20)));
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
    const sync = () => setJobs(readJobs());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return jobs;
}

async function fetchDraft(provider: PendingOrderProvider, id: string): Promise<PolledDraft> {
  if (provider === "INVID") return (await invidCheckoutApi.draftById(id)).data;
  if (provider === "NEW_BYTES") return (await newBytesCheckoutApi.draftById(id)).data;
  if (provider === "ELIT") return (await elitCheckoutApi.draftById(id)).data;
  if (provider === "GRUPO_NUCLEO") return (await grupoNucleoCheckoutApi.draftById(id)).data;
  return (await airCheckoutApi.draftById(id)).data;
}

export function usePendingOrderPolling() {
  const jobs = usePendingOrders();
  useEffect(() => {
    const pending = jobs.filter((j) => j.status === "PENDING");
    if (pending.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      for (const job of pending) {
        try {
          const row = await fetchDraft(job.provider, job.id);
          if (cancelled || !row || row.status === "PENDING") continue;
          patchPendingOrder(job.id, {
            status: row.status === "CREATED" ? "CREATED" : "FAILED",
            orderNumber: row.invidOrderNumber,
            webOrderNumber: row.invidWebOrderNumber,
            errorMessage: row.errorMessage,
            message: row.status === "CREATED"
              ? (row.invidWebOrderNumber
                ? `Pedido confirmado. Pedido web ${row.invidWebOrderNumber}.`
                : row.invidOrderNumber
                  ? `Pedido confirmado. Orden ${row.invidOrderNumber}.`
                  : "Pedido confirmado.")
              : (row.errorMessage || "No se pudo crear el pedido"),
          });
        } catch {
          // sigue pendiente
        }
      }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [jobs]);
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
      status: data.status === "CREATED" ? "CREATED" : data.status === "FAILED" ? "FAILED" : "PENDING",
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
    if (result?.status === "CREATED") onCreated(result.message);
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
