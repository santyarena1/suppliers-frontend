"use client";

import { useEffect, useState } from "react";

export type DocsNavGroup = { title: string; items: { id: string; label: string }[] };

/** Índice lateral: marca la sección que se está leyendo. */
export function DocsNav({ groups }: { groups: DocsNavGroup[] }) {
  const [active, setActive] = useState(groups[0]?.items[0]?.id ?? "");

  useEffect(() => {
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [groups]);

  return (
    <nav aria-label="Índice de la documentación" className="dv-nav">
      {groups.map((g) => (
        <div key={g.title} className="dv-nav__group">
          <p className="dv-nav__title">{g.title}</p>
          <ul>
            {g.items.map((i) => (
              <li key={i.id}>
                <a href={`#${i.id}`} className="dv-nav__link" aria-current={active === i.id ? "location" : undefined}>
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
