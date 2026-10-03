import Link from "next/link";
import type { CSSProperties } from "react";
import type { BrandDemo } from "@/lib/demoBanners";
import { rajdhani } from "./fonts";
import styles from "./banners.module.css";

type BrandStyle = CSSProperties & { "--accent": string; "--art-w": string };

/** Mosaico de marca: arte oficial a la derecha, fundido, logo y llamada. */
export default function BrandBanner({ demo }: { demo: BrandDemo }) {
  const style: BrandStyle = { "--accent": demo.accent, "--art-w": demo.artWidth };
  return (
    <Link
      href={demo.cta.href}
      className={`${styles.root} ${styles.brand} ${rajdhani.variable}`}
      style={style}
      aria-label={`${demo.title}: ${demo.cta.label}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={demo.art}
        alt=""
        className={styles.art}
        style={{ objectPosition: demo.artPosition }}
        loading="lazy"
        decoding="async"
      />
      <div className={styles.fade} aria-hidden />
      <div className={styles.slash} aria-hidden />
      <span className={styles.demo}>Demo</span>
      <div className={styles.copy}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={demo.logo.src}
          alt={demo.logo.alt}
          className={`${styles.logo} ${demo.logo.invert ? styles.logoInvert : ""}`}
        />
        <p className={styles.kicker}>{demo.kicker}</p>
        <h3 className={styles.title}>{demo.title}</h3>
        <p className={styles.body}>{demo.body}</p>
        {demo.tags.length > 0 && (
          <ul className={styles.tags}>
            {demo.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                {tag}
              </li>
            ))}
          </ul>
        )}
        <span className={styles.btn}>{demo.cta.label} →</span>
      </div>
    </Link>
  );
}
