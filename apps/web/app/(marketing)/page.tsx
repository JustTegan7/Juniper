import Link from "next/link";
import { Container } from "../../components/layout/Container";
import { siteConfig } from "../../lib/site-config";

// Placeholder marketing page. Each app replaces this with its own homepage.
export default function Home() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <p className="pill bg-surface-2 text-muted">From {siteConfig.parent}</p>
        <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] sm:text-6xl">{siteConfig.businessName}</h1>
        <p className="mt-6 max-w-xl text-lg text-muted">{siteConfig.tagline}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="btn btn-primary">Log in</Link>
        </div>
      </Container>
    </section>
  );
}
