import type { Metadata } from "next";
import Link from "next/link";
import { isManager } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";

export const metadata: Metadata = { title: "More" };

/** Phone menu for the screens that do not fit in the bottom tabs. */
export default async function MorePage() {
  const ctx = await getCtx();
  const v = ctx.workspace.vocab;
  const m = ctx.workspace.modules;
  const manager = isManager(ctx.role);
  const links = [
    ...(m.appointments ? [{ href: "/calendar", label: "Calendar" }] : []),
    ...(m.messages ? [{ href: "/messages", label: "Messages" }] : []),
    ...(m.customers ? [{ href: "/clients", label: v.clientPlural }] : []),
    ...(m.timeclock ? [{ href: "/clock", label: "Time clock" }, { href: "/time-off", label: "Time off" }, { href: "/timesheets", label: "Timesheets" }] : []),
    ...(m.shop ? [{ href: "/register", label: "Register" }, { href: "/orders", label: "Orders" }, ...(manager ? [{ href: "/products", label: "Products" }] : [])] : []),
    ...(manager
      ? [
          ...(m.appointments ? [{ href: "/services", label: v.servicePlural }] : []),
          { href: "/team", label: "Team and schedules" },
          { href: "/settings", label: "Settings" },
        ]
      : []),
  ];
  return (
    <div>
      <h1 className="text-3xl font-bold">More</h1>
      <ul className="card mt-6 divide-y divide-line">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block px-4 py-3 font-semibold">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
