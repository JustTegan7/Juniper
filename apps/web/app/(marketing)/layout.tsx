import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";
import { Analytics } from "@vercel/analytics/next";
import { softwareSchema } from "../../lib/structured-data";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema()) }} />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg">
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="flex-1">{children}</main>
      <Footer />
      {/* Vercel Web Analytics: page views only, no cookies. Turn it on in Vercel, Analytics tab. Marketing pages only. */}
      <Analytics />
    </div>
  );
}
