import type { ReactNode } from "react";
import { Container } from "../layout/Container";

export function Section({
  id,
  eyebrow,
  heading,
  description,
  children,
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  heading?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 py-16 sm:py-24 ${className}`}>
      <Container>
        {(eyebrow || heading || description) && (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-muted">{eyebrow}</p>}
            {heading && <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{heading}</h2>}
            {description && <p className="mt-4 text-muted">{description}</p>}
          </div>
        )}
        {children}
      </Container>
    </section>
  );
}
