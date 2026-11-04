import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBusinessBySlug } from "../../../lib/services/public";
import { siteConfig } from "../../../lib/site-config";

export const dynamic = "force-dynamic";

export default async function PublicBusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await loadBusinessBySlug(slug);
  if (!ws) notFound();
  const c = ws.settings.contact;
  return (
    <div className="min-h-screen" style={{ ["--brand" as string]: ws.brandColor }}>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link href={`/b/${ws.slug}`} className="min-w-0">
            <span className="block truncate font-display text-xl font-semibold">{ws.name}</span>
            {c.address && <span className="block truncate text-xs text-muted">{c.address}</span>}
          </Link>
          {c.phone && <a href={`tel:${c.phone}`} className="shrink-0 text-sm font-semibold underline">{c.phone}</a>}
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-muted">
        Powered by <a className="underline" href={siteConfig.url}>{siteConfig.businessName}</a>
      </footer>
    </div>
  );
}
