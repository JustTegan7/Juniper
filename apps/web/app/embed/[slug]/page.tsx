import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusinessBySlug, loadPublicMenu } from "../../../lib/services/public";
import { BookingFlow } from "../../../components/booking/BookingFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book online", robots: { index: false } };

/** The booking form with no header, made to sit inside a business's own website. */
export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const ws = await loadBusinessBySlug((await params).slug);
  if (!ws) notFound();
  const menu = await loadPublicMenu(ws);
  return (
    <main className="p-2 sm:p-4">
      <BookingFlow menu={menu} embedded accountHref={`/b/${ws.slug}/me`} />
    </main>
  );
}
