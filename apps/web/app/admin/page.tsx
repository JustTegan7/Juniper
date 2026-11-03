import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { INDUSTRIES, INDUSTRY_PRESETS } from "@evergreen/core";
import { Logo } from "../../components/Logo";
import { isPlatformAdmin } from "../../lib/platform";
import { getSession } from "../../lib/services/ctx";
import { loadAllBusinesses } from "../../lib/services/workspace";
import { CreateBusinessForm, InviteOwner, SupportButton } from "./AdminForms";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Evergreen's own page for setting up businesses on Juniper One. */
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!isPlatformAdmin(session.user.email)) redirect("/today");
  const all = await loadAllBusinesses();
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/today" className="btn btn-ghost btn-sm">Open the app</Link>
      </div>
      <h1 className="text-3xl font-bold">Juniper One admin</h1>
      <section className="card p-5" aria-labelledby="h-new">
        <h2 id="h-new" className="font-bold">Add a business</h2>
        <CreateBusinessForm industries={INDUSTRIES.map((i) => ({ id: i, label: INDUSTRY_PRESETS[i].label }))} />
      </section>
      <section className="card p-5" aria-labelledby="h-all">
        <h2 id="h-all" className="font-bold">Businesses ({all.length})</h2>
        <ul className="mt-3 divide-y divide-line">
          {all.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{w.name}</p>
                <p className="text-sm text-muted">
                  <a className="underline" href={`/b/${w.slug}`} target="_blank" rel="noreferrer">/b/{w.slug}</a> · {INDUSTRY_PRESETS[w.template as keyof typeof INDUSTRY_PRESETS]?.label ?? w.template} · {w.timezone}
                </p>
              </div>
              <InviteOwner workspaceId={w.id} />
              <SupportButton workspaceId={w.id} />
            </li>
          ))}
          {!all.length && <li className="py-3 text-sm text-muted">No businesses yet.</li>}
        </ul>
      </section>
    </div>
  );
}
