import Link from "next/link";
import { Container } from "./Container";
import { Logo } from "../Logo";
import { siteConfig } from "../../lib/site-config";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label={`${siteConfig.businessName} home`}>
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-4" aria-label="Primary">
          <Link href="/login" className="btn btn-primary btn-sm">Log in</Link>
        </nav>
      </Container>
    </header>
  );
}
