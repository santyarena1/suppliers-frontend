import type { Metadata } from "next";
import { assetAbsoluteUrl } from "@/lib/assets";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicKey: string }>;
}): Promise<Metadata> {
  const { publicKey } = await params;
  try {
    const res = await fetch(`${API}/public/news/${publicKey}`, { next: { revalidate: 120 } });
    if (!res.ok) return { title: "Nota" };
    const json = (await res.json()) as { data?: { title?: string; excerpt?: string; coverUrl?: string | null } };
    const article = json.data;
    if (!article?.title) return { title: "Nota" };
    const image = assetAbsoluteUrl(article.coverUrl);
    return {
      title: article.title,
      description: article.excerpt || undefined,
      openGraph: {
        title: article.title,
        description: article.excerpt || undefined,
        type: "article",
        images: image ? [{ url: image }] : undefined,
      },
    };
  } catch {
    return { title: "Nota" };
  }
}

export default function PublicNewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
