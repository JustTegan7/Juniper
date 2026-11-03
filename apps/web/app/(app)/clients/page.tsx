import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "../../../lib/services/ctx";
import { clientName, formatPhone, searchClients } from "../../../lib/services/clients";
import { ClientForm } from "./ClientForm";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getCtx();
  const { q = "" } = await searchParams;
  const rows = await searchClients(ctx, q.slice(0, 100), 100);
  const v = ctx.workspace.vocab;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold">{v.clientPlural}</h1>
        <ClientForm label={`New ${v.client.toLowerCase()}`} />
      </div>
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} className="input" placeholder="Search name, phone or email" aria-label={`Search ${v.clientPlural.toLowerCase()}`} />
        <button className="btn btn-soft">Search</button>
      </form>
      <ul className="card divide-y divide-line">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
              <span className="font-semibold">{clientName(c)}</span>
              <span className="text-sm text-muted">{[formatPhone(c.phone), c.email].filter(Boolean).join(" · ")}</span>
            </Link>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-8 text-center text-muted">{q ? "No matches." : `No ${v.clientPlural.toLowerCase()} yet. They are added when someone books.`}</li>}
      </ul>
    </div>
  );
}
