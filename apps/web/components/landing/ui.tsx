"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Trazo fino y constante en todo el sistema de íconos. */
export const ICON_STROKE = 1.25;

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-[1240px] px-6 sm:px-10 ${className}`}>{children}</div>
  );
}

/**
 * Revelado único de la página: opacidad y 14px, curva ease-out fuerte.
 * Se aplica al bloque, nunca a cada hijo, para no convertir el scroll en
 * una cascada de entradas idénticas.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-shown={shown}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`lnd-reveal ${className}`}
    >
      {children}
    </Tag>
  );
}

export function Button({
  href,
  children,
  variant = "primary",
  type,
  disabled,
  onClick,
  className = "",
}: {
  href?: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `lnd-btn lnd-btn--${variant} ${className}`;
  const inner = (
    <>
      <span>{children}</span>
      <ArrowRight className="lnd-btn__arrow w-4 h-4" strokeWidth={ICON_STROKE} />
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} disabled={disabled} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/**
 * Encabezado de sección. La metadata va al costado sobre una regla, nunca
 * apilada arriba del título: un título no necesita que lo anuncien.
 */
export function SectionHead({
  title,
  meta,
  lead,
  size = "lg",
}: {
  title: ReactNode;
  meta?: string;
  lead?: ReactNode;
  size?: "lg" | "md";
}) {
  return (
    <div className="mb-10 sm:mb-14">
      <div className="flex items-end gap-6">
        <h2 className={`lnd-display lnd-display--${size} flex-shrink-0`}>{title}</h2>
        <div className="hidden sm:flex flex-1 items-center gap-4 pb-2">
          <hr className="lnd-rule flex-1" />
          {meta && <span className="lnd-label whitespace-nowrap">{meta}</span>}
        </div>
      </div>
      {lead && <p className="lnd-body mt-5 text-[0.98rem]">{lead}</p>}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ember" | "out";
}) {
  const mod = tone === "ember" ? " lnd-chip--ember" : tone === "out" ? " lnd-chip--out" : "";
  return <span className={`lnd-chip${mod}`}>{children}</span>;
}

/** Marca lo que es material ilustrativo, para no hacer pasar un ejemplo por dato real. */
export function IllustrativeNote({ children }: { children: ReactNode }) {
  return <p className="lnd-note mt-3 leading-relaxed">{children}</p>;
}
