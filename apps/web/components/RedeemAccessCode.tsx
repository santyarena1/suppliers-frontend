"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Ticket, X, XCircle } from "lucide-react";
import { myApi } from "@/lib/api";

/**
 * Canje de un código de acceso.
 *
 * En escritorio se tipea. En el celular se puede escanear el QR que mandó el mayorista.
 */
export default function RedeemAccessCode({ onRedeemed }: { onRedeemed?: () => void }) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number>(0);

  useEffect(() => {
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const hasCamera = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    setCanScan(coarse && hasCamera);
  }, []);

  function stopScan() {
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    loopRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => stopScan(), []);

  async function submitCode(raw: string) {
    if (!raw.trim() || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await myApi.redeemCode(raw.trim());
      setResult({ ok: true, msg: `Quedaste conectado con ${res.data.tenantName}` });
      setCode("");
      onRedeemed?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResult({ ok: false, msg: msg || "No se pudo canjear el código" });
    } finally {
      setSending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await submitCode(code);
  }

  async function startScan() {
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
      });
      const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
      } }).BarcodeDetector;
      if (!Detector) return;
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          loopRef.current = requestAnimationFrame(() => { void tick(); });
          return;
        }
        try {
          const codes = await detector.detect(video);
          const found = codes[0]?.rawValue?.trim();
          if (found) {
            stopScan();
            setCode(found.toUpperCase());
            await submitCode(found);
            return;
          }
        } catch { /* el frame no se pudo leer */ }
        loopRef.current = requestAnimationFrame(() => { void tick(); });
      };
      loopRef.current = requestAnimationFrame(() => { void tick(); });
    } catch {
      setResult({ ok: false, msg: "No se pudo abrir la cámara. Tipéá el código." });
      stopScan();
    }
  }

  return (
    <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-3">
      <p className="text-xs text-surface-500">
        Si ya trabajás con un distribuidor o una marca que no aparece en la lista, pediles el
        código de acceso de NODO y canjealo acá.
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Ticket className="w-4 h-4 text-surface-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={40}
            className="w-full bg-surface-900 border border-surface-700 focus:border-brand-500 rounded-lg pl-9 pr-3 py-2 text-sm text-white tracking-widest outline-none transition-colors"
          />
        </div>
        {canScan && (
          <button
            type="button"
            onClick={() => (scanning ? stopScan() : startScan())}
            className="flex items-center justify-center gap-1.5 text-sm font-medium border border-surface-700 hover:border-surface-500 text-surface-200 rounded-lg px-4 py-2 transition-all"
          >
            <Camera className="w-4 h-4" />
            {scanning ? "Cerrar cámara" : "Escanear"}
          </button>
        )}
        <button
          type="submit"
          disabled={!code.trim() || sending}
          className="flex items-center justify-center gap-1.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-5 py-2 transition-all"
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          Canjear
        </button>
      </form>

      {scanning && (
        <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={stopScan}
            className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 text-white"
            aria-label="Cerrar cámara"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-white/80">
            Apuntá al código que te mandó el mayorista
          </p>
        </div>
      )}

      {result && (
        <div className={`flex items-center gap-1.5 text-xs rounded-md px-3 py-2 ${
          result.ok
            ? "bg-emerald-500/8 text-emerald-700 dark:text-emerald-400"
            : "bg-red-500/8 text-red-400"
        }`}>
          {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {result.msg}
        </div>
      )}
    </div>
  );
}
