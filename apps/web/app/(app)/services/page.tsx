import type { Metadata } from "next";
import { formatDuration, formatPrice } from "@evergreen/core";
import { getCtx, requireManager } from "../../../lib/services/ctx";
import { loadCatalog } from "../../../lib/services/catalog";
import { loadMembers } from "../../../lib/services/workspace";
import { CategoryForm, ServiceForm } from "./ServiceForms";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const ctx = await getCtx();
  requireManager(ctx);
  const [catalog, members] = await Promise.all([loadCatalog(ctx.workspace.id, { includeInactive: true }), loadMembers(ctx.workspace.id)]);
  const staff = members.filter((m) => m.bookable).map((m) => ({ id: m.membershipId, name: m.name }));
  const cats = catalog.categories.map((c) => ({ id: c.id, name: c.name }));
  const groups = [...catalog.categories.map((c) => ({ id: c.id as string | null, name: c.name })), { id: null, name: "No category" }];
  const v = ctx.workspace.vocab;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold">{v.servicePlural}</h1>
        <div className="flex gap-2">
          <CategoryForm />
          <ServiceForm categories={cats} staff={staff} label={`New ${v.service.toLowerCase()}`} staffLabel={v.staffPlural} />
        </div>
      </div>
      <p className="text-sm text-muted">
        Split a service into time with the {v.client.toLowerCase()}, processing time and finishing time, and the calendar lets the {v.staff.toLowerCase()} take someone else while it processes. If no one is picked under who performs it, every {v.staff.toLowerCase()} who takes appointments can.
      </p>
      {groups.map((g) => {
        const list = catalog.services.filter((s) => (s.categoryId ?? null) === g.id);
        if (!list.length && g.id === null) return null;
        return (
          <section key={g.id ?? "none"} className="card" aria-label={g.name}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-bold">{g.name}</h2>
              {g.id && <CategoryForm category={{ id: g.id, name: g.name }} />}
            </div>
            <ul className="divide-y divide-line">
              {list.map((s) => {
                const who = catalog.staffFor[s.id] ?? [];
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name} {!s.active && <span className="pill bg-surface-2 text-muted">Hidden</span>} {s.active && !s.bookableOnline && <span className="pill bg-surface-2 text-muted">Staff only</span>}</p>
                      <p className="text-sm text-muted">
                        {formatDuration(s.activeBefore + s.processing + s.activeAfter)}
                        {s.processing > 0 && ` (${s.processing} min processing)`}
                        {s.bufferAfter > 0 && ` + ${s.bufferAfter} min cleanup`} · {formatPrice(s.priceCents, s.priceFrom)} · {who.length ? who.map((id) => staff.find((x) => x.id === id)?.name).filter(Boolean).join(", ") : `Any ${v.staff.toLowerCase()}`}
                      </p>
                    </div>
                    <ServiceForm
                      categories={cats}
                      staff={staff}
                      label="Edit"
                      staffLabel={v.staffPlural}
                      service={{
                        id: s.id,
                        name: s.name,
                        description: s.description ?? "",
                        categoryId: s.categoryId ?? "none",
                        activeBefore: s.activeBefore,
                        processing: s.processing,
                        activeAfter: s.activeAfter,
                        bufferAfter: s.bufferAfter,
                        price: (s.priceCents / 100).toFixed(2),
                        priceFrom: s.priceFrom,
                        bookableOnline: s.bookableOnline,
                        active: s.active,
                        staff: who,
                        overrides: catalog.overrides
                          .filter((o) => o.serviceId === s.id)
                          .map((o) => ({ membershipId: o.membershipId, price: o.priceCents == null ? "" : (o.priceCents / 100).toFixed(2), activeBefore: o.activeBefore?.toString() ?? "", processing: o.processing?.toString() ?? "", activeAfter: o.activeAfter?.toString() ?? "" })),
                      }}
                    />
                  </li>
                );
              })}
              {!list.length && <li className="px-4 py-3 text-sm text-muted">Nothing here yet.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
