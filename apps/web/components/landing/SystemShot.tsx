"use client";

import Image from "next/image";
import { Reveal } from "./ui";

type Props = {
  src: string;
  alt: string;
  caption?: string;
  priority?: boolean;
  className?: string;
};

/** Captura real del sistema, embebida en la landing de producción. */
export default function SystemShot({ src, alt, caption, priority, className = "" }: Props) {
  return (
    <Reveal className={`lnd-shot ${className}`}>
      <div className="lnd-shot__frame">
        <Image
          src={src}
          alt={alt}
          width={2160}
          height={1350}
          className="lnd-shot__img"
          sizes="(max-width: 1240px) 100vw, 1120px"
          priority={priority}
          unoptimized
        />
      </div>
      {caption && <p className="lnd-shot__cap">{caption}</p>}
    </Reveal>
  );
}
