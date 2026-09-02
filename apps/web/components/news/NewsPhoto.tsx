import { assetUrl } from "@/lib/assets";

export default function NewsPhoto({
  src,
  alt,
  className = "",
  sizes,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  if (!src) {
    return <div className={`bg-surface-800 ${className}`} aria-hidden />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl(src)}
      alt={alt}
      sizes={sizes}
      className={`block w-full h-full object-cover ${className}`}
    />
  );
}
