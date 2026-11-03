import type { Metadata } from "next";
import { getCtx, requireManager } from "../../../lib/services/ctx";
import { loadBusinessHours } from "../../../lib/services/hours";
import { appUrl } from "../../../lib/platform";
import { BookingRules, BusinessDetails, BusinessHoursForm, ContactForm, EmbedSnippet, TimeRulesForm, VocabularyForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="card p-5" aria-labelledby={id}>
      <h2 id={id} className="font-bold">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const ctx = await getCtx();
  requireManager(ctx);
  const ws = ctx.workspace;
  const hours = await loadBusinessHours(ws.id);
  const base = appUrl();
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Section id="h-link" title="Online booking link" note="Share this link, add it to Instagram and Google, or put the booking page right on your website.">
        <EmbedSnippet bookingUrl={`${base}/b/${ws.slug}`} embedUrl={`${base}/embed/${ws.slug}`} scriptUrl={`${base}/embed.js`} slug={ws.slug} />
      </Section>
      <Section id="h-biz" title="Business">
        <BusinessDetails initial={{ name: ws.name, timezone: ws.timezone, brandColor: ws.brandColor }} />
      </Section>
      <Section id="h-hours" title="Business hours" note="Online booking only offers times inside these hours. Staff can still book outside them from the calendar.">
        <BusinessHoursForm initial={hours} />
      </Section>
      <Section id="h-booking" title="Booking rules">
        <BookingRules initial={ws.settings.booking} />
      </Section>
      <Section id="h-contact" title="Contact details" note="Shown on the booking page and in client emails.">
        <ContactForm initial={ws.settings.contact} />
      </Section>
      <Section id="h-time" title="Time clock rules" note={ctx.role === "owner" ? "Defaults follow Washington State: overtime after 40 hours a week, a 30 minute meal break for shifts over 5 hours. Check with your payroll provider before changing them." : "Only an owner can change these."}>
        <TimeRulesForm initial={ws.settings.time} disabled={ctx.role !== "owner"} />
      </Section>
      <Section id="h-words" title="Words" note="What your business calls things. Leave blank to use the default for your industry.">
        <VocabularyForm initial={ws.vocab} />
      </Section>
    </div>
  );
}
