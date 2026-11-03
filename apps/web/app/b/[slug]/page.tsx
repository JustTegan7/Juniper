import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBusinessBySlug, loadPublicMenu } from "../../../lib/services/public";
import { BookingFlow } from "../../../components/booking/BookingFlow";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const ws = await loadBusinessBySlug((await params).slug);
  if (!ws) return { title: "Not found" };
  return { title: { absolute: `Book at ${ws.name}` }, description: `Book an appointment online at ${ws.name}.`, robots: { index: true, follow: false } };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const ws = await loadBusinessBySlug((await params).slug);
  if (!ws) notFound();
  const menu = await loadPublicMenu(ws);
  return (
    <>
      <h1 className="sr-only">Book at {ws.name}</h1>
      <BookingFlow menu={menu} accountHref={`/b/${ws.slug}/me`} />
    </>
  );
}
