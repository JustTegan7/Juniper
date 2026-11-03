import Link from "next/link";
import { Container } from "../../components/layout/Container";
import { siteConfig } from "../../lib/site-config";

const FEATURES = [
  { title: "Online booking", body: "Clients pick a service, a person and a time from your website, Instagram or a link. Confirmations, reminders and self-service changes go out by email." },
  { title: "Processing time that books itself", body: "Split a color service into application, processing and finishing. While it processes, the stylist can take a cut." },
  { title: "Schedules and time off", body: "Weekly hours, split shifts and one-off changes per person. Team members request time off and managers approve it in one tap." },
  { title: "Time clock and timesheets", body: "Clock in and out with meal and rest breaks. Overtime and missed-meal flags follow Washington rules, and timesheets export to CSV for payroll." },
  { title: "Built into your website", body: "One line of code puts booking on any site. Evergreen Digital websites come with it built in." },
  { title: "Made for any appointment business", body: "Start with salons and barbershops, then spas, studios, trainers and groomers. Your words, your services, your rules." },
];

export default function Home() {
  return (
    <>
      <section className="py-16 sm:py-24">
        <Container>
          <p className="pill bg-surface-2 text-muted">From {siteConfig.parent}</p>
          <h1 className="mt-5 max-w-3xl text-5xl font-extrabold leading-[1.05] sm:text-6xl">Booking, schedules and the time clock, <span className="mark">in one place</span>.</h1>
          <p className="mt-6 max-w-xl text-lg text-muted">{siteConfig.tagline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`mailto:${siteConfig.email}?subject=Juniper%20One`} className="btn btn-primary">Talk to us</a>
            <Link href="/login" className="btn btn-soft">Log in</Link>
          </div>
        </Container>
      </section>
      <section className="pb-20">
        <Container>
          <h2 className="text-3xl font-bold">What it does</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
