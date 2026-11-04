import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusinessBySlug, loadPublicMenu } from "../../../lib/services/public";
import { BookingFlow } from "../../../components/booking/BookingFlow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book online", robots: { index: false } };

/** The booking form with no header, made to sit inside a business's own website. */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ theme?: string | string[] }>;
}) {
  const ws = await loadBusinessBySlug((await params).slug);
  if (!ws) notFound();
  const menu = await loadPublicMenu(ws);
  // Optional ?theme=light|dark forces the colors; anything else follows the device.
  const requested = (await searchParams).theme;
  const theme = requested === "light" || requested === "dark" ? requested : null;
  return (
    <main className="p-2 sm:p-4">
      {theme && <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme="${theme}"` }} />}
      <BookingFlow menu={menu} embedded accountHref={`/b/${ws.slug}/me`} />
    </main>
  );
}
