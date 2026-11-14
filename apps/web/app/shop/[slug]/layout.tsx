import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBusinessBySlug } from "../../../lib/services/public";
import { siteConfig } from "../../../lib/site-config";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const ws = await loadBusinessBySlug((await params).slug);
  if (!ws) notFound();
  return (
    <div className="min-h-screen" style={{ ["--brand" as string]: ws.brandColor }}>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <Link href={`/shop/${ws.slug}`} className="font-display text-xl font-semibold">{ws.name}</Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-8 text-center text-xs text-muted">
        Powered by <a className="underline" href={siteConfig.url}>{siteConfig.businessName}</a>
      </footer>
    </div>
  );
}
