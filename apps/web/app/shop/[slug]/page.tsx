import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadShop } from "../../../lib/services/online-orders";
import { loadBusinessBySlug } from "../../../lib/services/public";
import { Storefront } from "./Storefront";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const ws = await loadBusinessBySlug((await params).slug);
  return ws ? { title: { absolute: `Shop ${ws.name}` }, robots: { index: true, follow: false } } : { title: "Not found" };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) notFound();
  return (
    <>
      <h1 className="sr-only">Shop {shop.business.name}</h1>
      <Storefront slug={slug} shop={shop} />
    </>
  );
}
