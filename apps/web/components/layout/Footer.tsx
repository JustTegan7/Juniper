import Link from "next/link";
import { Container } from "./Container";
import { siteConfig } from "../../lib/site-config";
import { Logo } from "../Logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo size={24} />
          <p className="mt-2 text-sm text-muted">
            A product from{" "}
            <a href={siteConfig.parentUrl} className="underline">{siteConfig.parent}</a>
          </p>
          {/* Year comes from the build, so every deploy keeps it current. */}
          <p className="mt-1 text-xs text-muted">© {new Date().getFullYear()} {siteConfig.parent} All rights reserved.</p>
        </div>
        <nav aria-label="Legal" className="flex gap-4 text-sm text-muted">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
          <span>{siteConfig.url.replace(/^https?:\/\//, "")}</span>
        </nav>
      </Container>
    </footer>
  );
}
