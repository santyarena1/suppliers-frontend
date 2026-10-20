import { CHANGE_KIND_LABEL, changelogDate, type ChangeKind, type ChangelogEntry } from "@/lib/changelog";

const KIND_TONE: Record<ChangeKind, string> = {
  new: "border-brand-500/40 bg-brand-500/15 text-brand-200",
  improved: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  fixed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

/** Una versión: número, fecha, título y la lista de cambios con su tipo. */
export default function ChangelogEntryView({ entry, current = false }: { entry: ChangelogEntry; current?: boolean }) {
  return (
    <article>
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="rounded-md bg-surface-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-surface-200">v{entry.version}</span>
        {current && <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Versión actual</span>}
        <time dateTime={entry.date} className="text-[11px] text-surface-500">
          {changelogDate(entry.date)}
        </time>
      </header>
      <h3 className="mt-1.5 text-sm font-semibold text-white">{entry.title}</h3>
      <ul className="mt-2 space-y-1.5">
        {entry.changes.map((c) => (
          <li key={c.text} className="flex items-start gap-2 text-[13px] leading-relaxed text-surface-300">
            <span className={`mt-0.5 w-[4.25rem] flex-shrink-0 rounded-full border px-1.5 py-px text-center text-[10px] font-semibold ${KIND_TONE[c.kind]}`}>
              {CHANGE_KIND_LABEL[c.kind]}
            </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
