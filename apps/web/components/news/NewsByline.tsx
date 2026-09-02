import type { NewsAuthor } from "@/lib/api";
import { authorTypeLabel, formatNewsDate } from "@/lib/news";
import NewsPhoto from "./NewsPhoto";

export default function NewsByline({
  author,
  date,
  advertised,
  compact,
}: {
  author: NewsAuthor;
  date?: string | null;
  advertised?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${compact ? "" : "mt-3"}`}>
      <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-800 border border-white/10 flex-shrink-0">
        {author.logoUrl ? (
          <NewsPhoto src={author.logoUrl} alt="" className="object-contain bg-white" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-[10px] text-surface-400">
            {author.name.slice(0, 1)}
          </span>
        )}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="text-[13px] text-white truncate">{author.name}</p>
        <p className="text-[11px] text-surface-400 truncate">
          {authorTypeLabel(author.type)}
          {date ? ` · ${formatNewsDate(date)}` : ""}
          {advertised ? " · Publicidad" : ""}
        </p>
      </div>
    </div>
  );
}
