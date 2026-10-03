import Link from "next/link";
import type { CategoryDemo } from "@/lib/demoBanners";
import { spaceGrotesk } from "./fonts";
import styles from "./banners.module.css";

/** Mosaico de categoría: copy a la izquierda y tarjetas de producto real. */
export default function CategoryBanner({ demo }: { demo: CategoryDemo }) {
  return (
    <Link
      href={demo.cta.href}
      className={`${styles.root} ${styles.category} ${spaceGrotesk.variable}`}
      aria-label={`${demo.title}: ${demo.cta.label}`}
    >
      <div className={styles.grid} aria-hidden />
      <span className={styles.demo}>Demo</span>
      <div className={styles.catCopy}>
        <p className={styles.catKicker}>Categoría</p>
        <h3 className={styles.catTitle}>{demo.title}</h3>
        <p className={styles.catBody}>{demo.body}</p>
        <span className={styles.catBtn}>{demo.cta.label} →</span>
      </div>
      <div className={styles.cards}>
        {demo.products.map((p) => (
          <figure key={p.image} className={styles.card}>
            <div className={styles.cardImg}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.image}
                alt={`${p.logo.alt} ${p.model}`}
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption className={styles.cardFoot}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logo.src} alt="" className={styles.cardLogo} />
              <span className={styles.cardModel}>{p.model}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Link>
  );
}
