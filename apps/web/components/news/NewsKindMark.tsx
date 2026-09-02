import type { NewsKind } from "@/lib/api";
import { NEWS_KIND_LABELS } from "@/lib/news";

export default function NewsKindMark({ kind, light }: { kind: NewsKind; light?: boolean }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.16em] ${
        light ? "text-white/70" : "text-surface-400"
      }`}
    >
      {NEWS_KIND_LABELS[kind]}
    </span>
  );
}
