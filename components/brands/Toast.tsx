import { CheckCircle2, XCircle } from "lucide-react";

interface Props {
  toast: { msg: string; ok: boolean } | null;
}

export default function Toast({ toast }: Props) {
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm shadow-lg ${
        toast.ok
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-red-500/10 border-red-500/30 text-red-400"
      }`}
    >
      {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {toast.msg}
    </div>
  );
}
